export type LeadDeviceFields = {
  customer_number?: string | null;
  sku?: string | null;
  imei_sn?: string | null;
  battery_percentage?: number | null;
  used_parts_skus?: string[] | null;
};
export const leadFieldLabels = {
  customer_number: 'Klantnummer',
  sku: 'SKU (bestaande ERP-artikelcode)',
  imei_sn: 'IMEI of serienummer',
  battery_percentage: 'Batterijpercentage (0–100)',
  used_parts_skus: "Gebruikte onderdelen (SKU’s)",
  sku_invalid: 'Bestaande ERP-SKU voor Controle succesvol (een omschrijving volstaat niet)',
  sku_lookup_failed: 'SKU-controle is tijdelijk niet beschikbaar. Probeer opnieuw',
} as const;
export type LeadFieldIssue = keyof typeof leadFieldLabels;
export function getLeadStatusIssues(status: string, fields: LeadDeviceFields): LeadFieldIssue[] {
  const passed = status === 'check_passed';
  if (!passed && status !== 'check_failed_technical' && status !== 'check_failed_grading') return [];
  const missing: LeadFieldIssue[] = [];
  if (passed && !fields.customer_number?.trim()) missing.push('customer_number');
  if (passed && !fields.sku?.trim()) missing.push('sku');
  if (!fields.imei_sn?.trim()) missing.push('imei_sn');
  if (passed && (typeof fields.battery_percentage !== 'number' || !Number.isFinite(fields.battery_percentage) || fields.battery_percentage < 0 || fields.battery_percentage > 100)) missing.push('battery_percentage');
  if (passed && !fields.used_parts_skus?.some(sku => typeof sku === 'string' && sku.trim())) missing.push('used_parts_skus');
  return missing;
}
export function leadValidationMessage(fields: string | undefined): string {
  const labels = (fields ?? '').split(',').filter((key): key is LeadFieldIssue => Object.prototype.hasOwnProperty.call(leadFieldLabels, key)).map(key => leadFieldLabels[key]);
  return labels.length ? 'Niet opgeslagen. Vul aan of corrigeer: ' + labels.join('; ') + '. Sla de toestelgegevens eerst op en wijzig daarna de status.' : 'Niet opgeslagen. Controleer de toestelgegevens en probeer opnieuw.';
}
