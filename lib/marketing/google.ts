import 'server-only';
// Reads Search Console, Analytics 4 and Merchant Center with the Google service account (read-only scopes,
// plus the Merchant API scope). Settings come from the environment; the key is never logged or returned.
import { createSign } from 'node:crypto';
import { ga4Channels, gscTop, gscTotals, gscWindows, isMerchantUnregistered, merchantSummary, parseServiceAccount, type Ga4Channel, type GscTop, type GscTotals, type MerchantSummary, type ServiceAccount } from '@/lib/marketing/googleData';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/content'];
type Fetch = typeof fetch;
const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let cached: { email: string; token: string; until: number } | null = null;

/** OAuth access token for the service account (JWT bearer grant), kept until shortly before it expires. */
export async function accessToken(sa: ServiceAccount, deps: { fetch?: Fetch; now?: () => number } = {}): Promise<string> {
  const now = (deps.now ?? Date.now)();
  if (cached && cached.email === sa.clientEmail && cached.until > now + 60_000) return cached.token;
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }))}`;
  const signature = b64url(createSign('RSA-SHA256').update(unsigned).sign(sa.privateKey));
  const res = await (deps.fetch ?? fetch)('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString(),
  });
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google weigerde het serviceaccount: ${body.error_description ?? body.error ?? res.status}`);
  cached = { email: sa.clientEmail, token: body.access_token, until: now + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function call<T>(sa: ServiceAccount, url: string, body: unknown, deps: { fetch?: Fetch } = {}): Promise<T> {
  const token = await accessToken(sa, deps);
  const res = await (deps.fetch ?? fetch)(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const json = await res.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json;
}

export function googleSettings(env: Record<string, string | undefined> = process.env) {
  return { sa: parseServiceAccount(env.GOOGLE_SERVICE_ACCOUNT_JSON), site: env.GSC_SITE_URL?.trim() || null, ga4: env.GA4_PROPERTY_ID?.trim() || null, merchant: env.MERCHANT_CENTER_ID?.trim() || null };
}

export type SearchConsoleData = { window: { start: string; end: string }; current: GscTotals; previous: GscTotals; queries: GscTop[]; pages: GscTop[] };

export async function searchConsole(sa: ServiceAccount, site: string, now = new Date(), deps: { fetch?: Fetch } = {}): Promise<SearchConsoleData> {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const w = gscWindows(now);
  const q = (body: Record<string, unknown>) => call<{ rows?: never[] }>(sa, url, body, deps);
  const [cur, prev, queries, pages] = await Promise.all([
    q({ startDate: w.current.start, endDate: w.current.end }),
    q({ startDate: w.previous.start, endDate: w.previous.end }),
    q({ startDate: w.current.start, endDate: w.current.end, dimensions: ['query'], rowLimit: 10 }),
    q({ startDate: w.current.start, endDate: w.current.end, dimensions: ['page'], rowLimit: 10 }),
  ]);
  return { window: w.current, current: gscTotals(cur), previous: gscTotals(prev), queries: gscTop(queries), pages: gscTop(pages) };
}

export async function analytics(sa: ServiceAccount, property: string, deps: { fetch?: Fetch } = {}): Promise<Ga4Channel[]> {
  if (!/^\d+$/.test(property)) throw new Error('GA4_PROPERTY_ID moet het nummer van de property zijn (alleen cijfers).');
  const res = await call<never>(sa, `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'keyEvents' }, { name: 'purchaseRevenue' }],
  }, deps);
  return ga4Channels(res);
}

const MERCHANT_QUERY = 'SELECT id, offer_id, title, aggregated_reporting_context_status, item_issues FROM product_view';

export async function merchantCenter(sa: ServiceAccount, account: string, deps: { fetch?: Fetch } = {}): Promise<MerchantSummary> {
  if (!/^\d+$/.test(account)) throw new Error('MERCHANT_CENTER_ID moet het account-ID zijn (alleen cijfers).');
  const pages: { results?: never[]; nextPageToken?: string }[] = [];
  let pageToken: string | undefined;
  // At most 20 pages of 1000 products: far above this shop's catalogue, and it bounds the page load.
  for (let i = 0; i < 20; i++) {
    const page = await call<{ results?: never[]; nextPageToken?: string }>(sa, `https://merchantapi.googleapis.com/reports/v1/accounts/${account}/reports:search`, { query: MERCHANT_QUERY, pageSize: 1000, ...(pageToken ? { pageToken } : {}) }, deps);
    pages.push(page);
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return merchantSummary(pages);
}

/**
 * One-time registration of the Cloud project with the Merchant Center account (needed before any other
 * Merchant API call). The developer email is a person (never the service account): Google sends API news there.
 */
export async function registerMerchant(sa: ServiceAccount, account: string, developerEmail: string, deps: { fetch?: Fetch } = {}) {
  if (!/^\d+$/.test(account)) throw new Error('MERCHANT_CENTER_ID moet het account-ID zijn (alleen cijfers).');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(developerEmail) || /gserviceaccount\.com$/i.test(developerEmail)) throw new Error('Geef het e-mailadres van een persoon als technisch contact.');
  await call(sa, `https://merchantapi.googleapis.com/accounts/v1/accounts/${account}/developerRegistration:registerGcp`, { developerEmail }, deps);
}

export { isMerchantUnregistered };
