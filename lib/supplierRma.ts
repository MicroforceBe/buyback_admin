export const supplierRmaStages = {
  draft: 'Concept', submitted: 'Aangemeld', approved: 'Goedgekeurd', sent: 'Verzonden',
  received: 'Ontvangen door leverancier', awaiting_compensation: 'Wacht op compensatie',
  closed: 'Afgesloten', rejected: 'Geweigerd', cancelled: 'Geannuleerd',
} as const;
export type SupplierRmaStage = keyof typeof supplierRmaStages;
export const mentionsRma = (value: string | null | undefined) => /(^|[^a-z0-9])rma([^a-z0-9]|$)/i.test(value ?? '');
export function isSupplierRmaItem(item: { refurb_status?: string | null; compensation_cents?: number | null; rma_registered?: boolean }, options: { value: string; label?: string | null }[] = []) {
  const status = (item.refurb_status ?? '').trim().toLowerCase();
  return !!item.rma_registered || typeof item.compensation_cents === 'number' || mentionsRma(status) || options.some(option => (option.value.trim().toLowerCase() === status || option.label?.trim().toLowerCase() === status) && (mentionsRma(option.value) || mentionsRma(option.label)));
}
export function compensationOnRmaEntry(item: { refurb_status?: string | null; compensation_cents?: number | null; price_cents?: number | null }, next: string): number | null {
  if (next.trim().toLowerCase() === 'rma' && (item.refurb_status ?? '').trim().toLowerCase() !== 'rma' && item.compensation_cents == null) return item.price_cents ?? null;
  return item.compensation_cents ?? null;
}
export function rmaMoney(raw: unknown, nullable = false): number | null {
  const text = String(raw ?? '').trim();
  if (!text && nullable) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) throw Error('Vul een geldig positief bedrag in (maximaal twee decimalen).');
  const [euros, decimals = ''] = text.replace(',', '.').split('.');
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 2147483647) throw Error('Het bedrag is te groot.');
  return cents;
}
export function rmaDate(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) throw Error('Vul een geldige datum in.');
  return text;
}
export function supplierRmaTotals(items: { expected_cents: number | null; received_cents: number }[]) {
  return items.reduce((sum, item) => ({ expected: sum.expected + (item.expected_cents ?? 0), received: sum.received + item.received_cents, outstanding: sum.outstanding + (item.expected_cents == null ? 0 : Math.max(0, item.expected_cents - item.received_cents)), unknown: sum.unknown + (item.expected_cents == null ? 1 : 0) }), { expected: 0, received: 0, outstanding: 0, unknown: 0 });
}
