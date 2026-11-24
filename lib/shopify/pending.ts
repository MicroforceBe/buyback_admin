// Online sales that Shopify already shipped or handed over, but that the ERP does not know yet (pure).
//
// The sync writes the ERP stock as Shopify's "on hand" quantity. An open (unfulfilled) order is then
// covered by Shopify itself: its units are "committed" and never available. Once the order is
// fulfilled, Shopify lowers "on hand"; until someone books the sale in the ERP (by hand, during the
// opening hours of Gentbrugge) the ERP still counts the unit, and the next run would put it back on
// sale. This module keeps those units apart per SKU and location:
//  - A fulfilled line seen for the first time counts as not yet in the ERP for the part that the ERP
//    stock (minus what is already pending) exceeds Shopify's current on-hand quantity. A sale the ERP
//    already booked therefore never counts twice.
//  - A drop of the ERP stock books pending units, oldest first. A rise (new stock) books nothing, so new
//    stock goes online right away.
//  - A unit pending for more than MAX_AGE_DAYS is dropped and reported: the ERP probably never booked it.
// The state is kept per variant in a JSON metafield (only for SKUs with recent online fulfilments).

export const PENDING_METAFIELD = { namespace: 'microforce_sync', key: 'online_pending', type: 'json' } as const;
export const MAX_AGE_DAYS = 7;

export type Fulfilled = { id: string; sku: string; location: string; qty: number; at: string };
type Line = { id: string; q: number; at: string };
type LocationState = { e: number; open: Line[]; done: { id: string; at: string }[] };
type VariantState = Record<string, LocationState>;

export type PendingVariant = { variantId: string; sku: string; onHand: Record<string, number>; pending: string | null };

export type PendingResult = {
  /** On-hand quantity to write per SKU and location (ERP stock minus pending units); only where it differs from the ERP. */
  targets: Map<string, Record<string, number>>;
  /** State to save per variant: a JSON string, or null to delete it. Only variants whose state changed. */
  writes: { variantId: string; value: string | null }[];
  pendingUnits: number;
  pendingSkus: { sku: string; location: string; qty: number; since: string }[];
  expired: { sku: string; location: string; qty: number; at: string }[];
};

function parse(raw: string | null): VariantState {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v as VariantState : {};
  } catch { return {}; }
}

/**
 * variants: Shopify variants (unique SKUs only) with their on-hand stock before this run and saved state.
 * erp: ERP stock per SKU and location. fulfilled: fulfilled order lines of the last MAX_AGE_DAYS days.
 */
export function computePending(input: { variants: PendingVariant[]; erp: Map<string, Record<string, number>>; fulfilled: Fulfilled[]; now: number; maxAgeDays?: number }): PendingResult {
  const maxAge = (input.maxAgeDays ?? MAX_AGE_DAYS) * 86_400_000;
  const result: PendingResult = { targets: new Map(), writes: [], pendingUnits: 0, pendingSkus: [], expired: [] };
  const bySku = new Map<string, Fulfilled[]>();
  for (const f of input.fulfilled) {
    if (!f.sku || f.qty <= 0 || input.now - Date.parse(f.at) > maxAge) continue;
    bySku.set(f.sku, [...(bySku.get(f.sku) ?? []), f]);
  }
  for (const v of input.variants) {
    const lines = bySku.get(v.sku) ?? [];
    if (!v.pending && !lines.length) continue;
    const erp = input.erp.get(v.sku);
    if (!erp) continue;
    const before = v.pending ?? null;
    const state = parse(v.pending);
    const locations = new Set([...Object.keys(state), ...lines.map(l => l.location)]);
    for (const location of locations) {
      const e = erp[location];
      if (e === undefined) continue; // no ERP column for this store: leave everything as it is
      const s: LocationState = state[location] ?? { e, open: [], done: [] };
      s.open = Array.isArray(s.open) ? s.open : [];
      s.done = Array.isArray(s.done) ? s.done : [];
      // 1. The ERP stock dropped: those units are booked now, oldest first.
      let booked = Math.max(0, (Number.isFinite(s.e) ? s.e : e) - e);
      for (const line of s.open) {
        const take = Math.min(line.q, booked);
        line.q -= take;
        booked -= take;
        if (line.q === 0) s.done.push({ id: line.id, at: line.at });
      }
      s.open = s.open.filter(l => l.q > 0);
      // 2. Too old: the ERP never booked it (or another sale was counted instead). Drop and report.
      for (const line of s.open) if (input.now - Date.parse(line.at) > maxAge) {
        result.expired.push({ sku: v.sku, location, qty: line.q, at: line.at });
        s.done.push({ id: line.id, at: line.at });
      }
      s.open = s.open.filter(l => input.now - Date.parse(l.at) <= maxAge);
      s.done = s.done.filter(d => input.now - Date.parse(d.at) <= maxAge + 86_400_000);
      // 3. Lines seen for the first time: only the part the ERP has not booked yet is pending.
      const known = new Set([...s.open.map(l => l.id), ...s.done.map(d => d.id)]);
      const fresh = lines.filter(l => l.location === location && !known.has(l.id)).sort((a, b) => a.at.localeCompare(b.at));
      if (fresh.length) {
        const pendingBefore = s.open.reduce((n, l) => n + l.q, 0);
        const onHand = v.onHand[location] ?? 0;
        let unbooked = Math.max(0, Math.min(fresh.reduce((n, l) => n + l.qty, 0), e - pendingBefore - onHand));
        for (const l of fresh) {
          const q = Math.min(l.qty, unbooked);
          unbooked -= q;
          if (q > 0) s.open.push({ id: l.id, q, at: l.at });
          else s.done.push({ id: l.id, at: l.at });
        }
      }
      s.e = e;
      const pending = s.open.reduce((n, l) => n + l.q, 0);
      if (pending > 0) {
        result.targets.set(v.sku, { ...(result.targets.get(v.sku) ?? {}), [location]: Math.max(0, e - pending) });
        result.pendingUnits += pending;
        result.pendingSkus.push({ sku: v.sku, location, qty: pending, since: s.open[0].at });
      }
      if (s.open.length || s.done.length) state[location] = s; else delete state[location];
    }
    const after = Object.keys(state).length ? JSON.stringify(state) : null;
    if (after !== before) result.writes.push({ variantId: v.variantId, value: after });
  }
  return result;
}
