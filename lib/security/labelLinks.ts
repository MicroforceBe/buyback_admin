import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE = 30 * 24 * 60 * 60;
const validId = (value: string) => /^[1-9][0-9]{0,19}$/.test(value);
function secret() {
  const key = process.env.SENDCLOUD_LABEL_LINK_SECRET;
  if (!key || key.length < 32) throw new Error('Beveiligde labellinks zijn niet ingesteld.');
  return key;
}
function signature(id: string, expires: string, key: string) {
  return createHmac('sha256', key).update('sendcloud-label:v1:' + id + ':' + expires).digest('base64url');
}
function publicBase() {
  const raw = process.env.MAIL_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.MAIL_BRAND_URL;
  if (!raw) throw new Error('Publiek adres voor labellinks ontbreekt.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Ongeldig publiek adres voor labellinks.');
  }
  return url.origin;
}
export function createLabelLink(id: string, now = Date.now()): string {
  if (!validId(id)) throw new Error('Ongeldig labelnummer.');
  const expires = String(Math.floor(now / 1000) + MAX_AGE);
  const url = new URL('/api/admin/sendcloud/label', publicBase());
  url.searchParams.set('parcel_id', id);
  url.searchParams.set('expires', expires);
  url.searchParams.set('signature', signature(id, expires, secret()));
  return url.toString();
}
export function validLabelLink(id: string, expires: string | null, supplied: string | null, now = Date.now()): boolean {
  if (!validId(id) || !expires || !/^[0-9]{10}$/.test(expires) || !supplied || !/^[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
  const seconds = Math.floor(now / 1000);
  if (Number(expires) <= seconds || Number(expires) > seconds + MAX_AGE + 60) return false;
  try {
    const expected = signature(id, expires, secret());
    return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  } catch { return false; }
}
export function normalizeCustomerLabelLink(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (validId(raw)) return createLabelLink(raw);
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Ongeldige labellink.');
  const sendcloud = url.hostname === 'panel.sendcloud.sc' && /^\/api\/v3\/parcels\/([1-9][0-9]{0,19})\/documents\/label\/?$/.exec(url.pathname);
  if (sendcloud) return createLabelLink(sendcloud[1]);
  if (url.origin === publicBase() && /^\/api\/admin\/sendcloud(?:\/label)?$/.test(url.pathname)) {
    return createLabelLink(url.searchParams.get('parcel_id') || '');
  }
  // Preserve existing provider-hosted HTTPS download links.
  return url.toString();
}

