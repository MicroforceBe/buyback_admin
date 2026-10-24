export type AnalyticsReception = { id: string; supplier: string | null; supplier_id: string | null; reception_date: string | null };
export type AnalyticsItem = { id: string; reception_id: string; refurb_status: string | null; description: string | null; price_cents: number | null };
export type AnalyticsModel = { id: string; name: string; search_keywords: string | null };
export type AnalyticsStatus = { id: string; value: string; label: string | null };
export type AnalyticsTransition = { from_status_id: string; to_status_id: string };
export type AnalyticsFilters = { from: string; to: string; supplier: string };
export type AnalyticsInput = {
  receptions: AnalyticsReception[]; items: AnalyticsItem[]; models: AnalyticsModel[];
  statuses: AnalyticsStatus[]; transitions: AnalyticsTransition[]; suppliers: { id: string; name: string }[];
};
const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
export function parseAnalyticsFilters(params: Record<string, string | string[] | undefined>): AnalyticsFilters {
  const value = (key: string) => typeof params[key] === 'string' ? (params[key] as string).trim() : '';
  const from = value('from'), to = value('to');
  for (const date of [from, to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error('Kies een geldige begin- en einddatum.');
  if (from && to && from > to) throw Error('De begindatum moet vóór of op de einddatum liggen.');
  return { from, to, supplier: value('supplier') };
}
export function buildRefurbAnalytics(input: AnalyticsInput, filters: AnalyticsFilters) {
  const supplierNames = new Map(input.suppliers.map(row => [row.id, row.name]));
  const vendor = (row: AnalyticsReception) => ({
    key: row.supplier_id ? 'id:' + row.supplier_id : 'name:' + norm(row.supplier),
    name: supplierNames.get(row.supplier_id ?? '') || row.supplier?.trim() || 'Onbekende leverancier',
  });
  const availableSuppliers = Array.from(new Map(input.receptions.map(row => { const s = vendor(row); return [s.key, s]; })).values()).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const receptions = input.receptions.filter(row => {
    const date = row.reception_date ?? '';
    return (!filters.supplier || vendor(row).key === filters.supplier) && (!filters.from || date >= filters.from) && (!filters.to || (!!date && date <= filters.to));
  });
  const receptionById = new Map(receptions.map(row => [row.id, row]));
  const aliases = new Map<string, string>(), labels = new Map<string, string>();
  const outgoing = new Set(input.transitions.map(row => row.from_status_id));
  const finals = new Set<string>();
  for (const status of input.statuses) {
    const value = norm(status.value);
    if (!value) continue;
    aliases.set(value, value);
    if (norm(status.label)) aliases.set(norm(status.label), value);
    labels.set(value, status.label?.trim() || status.value);
    if (!outgoing.has(status.id)) finals.add(value);
  }
  const isFinished = (value: string) => input.transitions.length > 0 ? finals.has(value) : value === 'booked' || value === 'ready to book' || value === 'ready_to_book' || value.includes('finished');
  const models = [...input.models].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const modelFor = (description: string | null) => {
    const desc = norm(description);
    return models.find(model => (model.search_keywords ?? '').toLowerCase().split(',').map(word => word.trim()).filter(Boolean).some(word => desc.includes(word)))?.name || 'Niet herkend';
  };
  type VendorStats = { key: string; name: string; receptions: number; purchased: number; purchaseCents: number; missingPrices: number; rma: number; open: number; rmaPercent: number };
  const vendors = new Map<string, VendorStats>();
  for (const reception of receptions) {
    const supplier = vendor(reception);
    const row = vendors.get(supplier.key) ?? { ...supplier, receptions: 0, purchased: 0, purchaseCents: 0, missingPrices: 0, rma: 0, open: 0, rmaPercent: 0 };
    row.receptions++; vendors.set(supplier.key, row);
  }
  const openGroups = new Map<string, { key: string; model: string; supplier: string; status: string; count: number; purchaseCents: number; missingPrices: number }>();
  for (const item of input.items) {
    const reception = receptionById.get(item.reception_id);
    if (!reception) continue;
    const supplier = vendor(reception), row = vendors.get(supplier.key)!;
    const status = aliases.get(norm(item.refurb_status)) ?? norm(item.refurb_status);
    const priced = typeof item.price_cents === 'number' && Number.isFinite(item.price_cents);
    const cents = priced ? item.price_cents! : 0;
    row.purchased++; row.purchaseCents += cents; row.missingPrices += priced ? 0 : 1;
    if (status === 'rma') row.rma++;
    if (isFinished(status)) continue;
    row.open++;
    const model = modelFor(item.description), key = JSON.stringify([model, supplier.key, status]);
    const group = openGroups.get(key) ?? { key, model, supplier: supplier.name, status: labels.get(status) || item.refurb_status?.trim() || 'Geen status', count: 0, purchaseCents: 0, missingPrices: 0 };
    group.count++; group.purchaseCents += cents; group.missingPrices += priced ? 0 : 1; openGroups.set(key, group);
  }
  const supplierRows = Array.from(vendors.values()).map(row => ({ ...row, rmaPercent: row.purchased ? row.rma / row.purchased * 100 : 0 })).sort((a, b) => b.purchased - a.purchased || a.name.localeCompare(b.name, 'nl'));
  const totals = supplierRows.reduce((sum, row) => ({ purchased: sum.purchased + row.purchased, purchaseCents: sum.purchaseCents + row.purchaseCents, missingPrices: sum.missingPrices + row.missingPrices, rma: sum.rma + row.rma, open: sum.open + row.open }), { purchased: 0, purchaseCents: 0, missingPrices: 0, rma: 0, open: 0 });
  const openRows = Array.from(openGroups.values()).sort((a, b) => a.model.localeCompare(b.model, 'nl') || a.supplier.localeCompare(b.supplier, 'nl') || a.status.localeCompare(b.status, 'nl'));
  const summarize = (field: 'model' | 'supplier' | 'status') => {
    const counts = new Map<string, number>();
    for (const row of openRows) counts.set(row[field], (counts.get(row[field]) ?? 0) + row.count);
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nl'));
  };
  return { availableSuppliers, supplierRows, totals, rmaPercent: totals.purchased ? totals.rma / totals.purchased * 100 : 0, openRows, byModel: summarize('model'), bySupplier: summarize('supplier'), byStatus: summarize('status') };
}
