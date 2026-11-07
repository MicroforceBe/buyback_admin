// Google marketing data (pure): service-account settings, date windows and the parsing of Search Console,
// Analytics 4 and Merchant Center (Merchant API reports) responses into what the overview shows.

export type ServiceAccount = { clientEmail: string; privateKey: string; projectId: string | null };

/** The service-account JSON from the settings; null when absent, an error when unusable (without echoing its contents). */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw?.trim()) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw); } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is geen geldige JSON.'); }
  const clientEmail = typeof j.client_email === 'string' ? j.client_email : '';
  const privateKey = typeof j.private_key === 'string' ? j.private_key.replace(/\\n/g, '\n') : '';
  if (j.type !== 'service_account' || !clientEmail || !privateKey.includes('PRIVATE KEY')) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is geen sleutel van een serviceaccount.');
  return { clientEmail, privateKey, projectId: typeof j.project_id === 'string' ? j.project_id : null };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * Two windows of 28 days for Search Console, ending 3 days ago (its data lags 2–3 days): the current
 * window and the one before it, to show the change.
 */
export function gscWindows(now: Date): { current: { start: string; end: string }; previous: { start: string; end: string } } {
  const end = addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -3);
  return {
    current: { start: day(addDays(end, -27)), end: day(end) },
    previous: { start: day(addDays(end, -55)), end: day(addDays(end, -28)) },
  };
}

export type GscTotals = { clicks: number; impressions: number; ctr: number; position: number };
type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };

/** Totals of a query without dimensions (one row, or none when there is no data). */
export function gscTotals(res: { rows?: GscRow[] } | null): GscTotals {
  const r = res?.rows?.[0];
  return { clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, ctr: r?.ctr ?? 0, position: r?.position ?? 0 };
}

export type GscTop = { key: string; clicks: number; impressions: number; ctr: number; position: number };
export function gscTop(res: { rows?: GscRow[] } | null): GscTop[] {
  return (res?.rows ?? []).map(r => ({ key: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 }));
}

export type Ga4Channel = { channel: string; sessions: number; users: number; keyEvents: number; revenue: number };
type Ga4Res = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[] };

/** GA4 runReport by channel with metrics sessions, totalUsers, keyEvents, purchaseRevenue (in that order). */
export function ga4Channels(res: Ga4Res | null): Ga4Channel[] {
  const n = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (res?.rows ?? []).map(r => ({
    channel: r.dimensionValues?.[0]?.value || '(onbekend)',
    sessions: n(r.metricValues?.[0]?.value), users: n(r.metricValues?.[1]?.value),
    keyEvents: n(r.metricValues?.[2]?.value), revenue: n(r.metricValues?.[3]?.value),
  })).sort((a, b) => b.sessions - a.sessions);
}

export const MERCHANT_STATUS_LABELS: Record<string, string> = {
  ELIGIBLE: 'Goedgekeurd', ELIGIBLE_LIMITED: 'Beperkt', NOT_ELIGIBLE_OR_DISAPPROVED: 'Afgekeurd', PENDING: 'In behandeling',
};

type MerchantRow = { productView?: { aggregatedReportingContextStatus?: string; itemIssues?: { type?: { code?: string; canonicalAttribute?: string } }[] } };
export type MerchantSummary = { products: number; byStatus: Record<string, number>; issues: { code: string; attribute: string | null; products: number }[] };

/** Product counts per status and the most frequent issues (number of products per issue code), over all pages. */
export function merchantSummary(pages: { results?: MerchantRow[] }[]): MerchantSummary {
  const byStatus: Record<string, number> = {};
  const issues = new Map<string, { code: string; attribute: string | null; products: number }>();
  let products = 0;
  for (const page of pages) for (const row of page.results ?? []) {
    const v = row.productView;
    if (!v) continue;
    products++;
    const s = v.aggregatedReportingContextStatus ?? 'UNSPECIFIED';
    byStatus[s] = (byStatus[s] ?? 0) + 1;
    // An issue counts once per product, even when it applies to several countries or destinations.
    const seen = new Set<string>();
    for (const i of v.itemIssues ?? []) {
      const code = i.type?.code;
      if (!code || seen.has(code)) continue;
      seen.add(code);
      const cur = issues.get(code) ?? { code, attribute: i.type?.canonicalAttribute ?? null, products: 0 };
      cur.products++;
      issues.set(code, cur);
    }
  }
  return { products, byStatus, issues: [...issues.values()].sort((a, b) => b.products - a.products || a.code.localeCompare(b.code)).slice(0, 10) };
}

/** Merchant API answers this way until the Cloud project is registered with the Merchant Center account. */
export const isMerchantUnregistered = (message: string) => /not registered with the merchant account/i.test(message);

/** Readable change in percent; null without a basis. */
export const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);
