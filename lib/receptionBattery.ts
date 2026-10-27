export const SMARTPHONE_MIN_BATTERY = 85;
export function parseReceptionBattery(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === '' || String(raw).trim() === '-') return null;
  const text = String(raw).trim();
  if (!/^\d{1,3}$/.test(text) || Number(text) > 100) throw new Error('Batterijcapaciteit moet een geheel getal van 0 tot 100 zijn, of -.');
  return Number(text);
}
export function isSmartphoneDescription(text: string | null | undefined): boolean {
  const value = (text ?? '').toLowerCase();
  if (/\b(ipad|tablet|galaxy\s+tab|macbook|laptop|notebook|watch|accessor\w*|hoes\w*|screen\s+protector|screen\s+assembly|replacement|spare\s+part)\b/.test(value)) return false;
  return /\b(iphone|smartphone|gsm)\b|\biphone\s*\d|\bsamsung\s*[samfz]\s*\d|\b(?:google\s+)?pixel\s*(?:\d|fold)|\b(?:samsung\s+)?galaxy\s*(?:[samfz]\s*\d|note\s*\d|fold|flip)|\b(?:oneplus|redmi|poco|xperia)\b|\b(?:huawei|honor|oppo|realme|motorola|nokia|xiaomi)\s+(?:p\d|mate|nova|magic|find|reno|edge|moto|g\d|c\d|\d)/i.test(value);
}
export function receptionBatteryLabelIssue(raw: unknown, ...descriptions: Array<string | null | undefined>): string | null {
  let battery: number | null;
  try { battery = parseReceptionBattery(raw); } catch (error) { return (error as Error).message; }
  if (descriptions.some(isSmartphoneDescription) && (battery === null || battery < SMARTPHONE_MIN_BATTERY))
    return 'Voor een smartphone is een opgeslagen batterijcapaciteit van minstens 85% verplicht om het label te printen.';
  return null;
}
