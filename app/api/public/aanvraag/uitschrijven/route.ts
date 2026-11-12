import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { LANGS, unsubscribePage, type Lang } from '@/lib/stockRequests/core';

// Publiek: uitschrijven van een verwittiging "Op aanvraag" via de link in de mail. GET toont alleen een knop (mailscanners
// openen links automatisch); pas de POST van die knop zet alle open rijen met dit token op "unsubscribed".
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const lang = (v: unknown): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : 'nl');
const page = (html: string, status = 200) => new Response(html, {
  status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const l = lang(url.searchParams.get('l'));
  const t = url.searchParams.get('t') || '';
  return page(unsubscribePage(l, UUID.test(t) ? 'ask' : 'gone', UUID.test(t) ? t : ''), UUID.test(t) ? 200 : 404);
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const l = lang(form?.get('l'));
  const t = String(form?.get('t') ?? '');
  if (!UUID.test(t)) return page(unsubscribePage(l, 'gone', ''), 404);
  const { data, error } = await supabaseAdmin.from('shop_stock_requests')
    .update({ status: 'unsubscribed', updated_at: new Date().toISOString() }).eq('token', t).eq('status', 'open').select('id');
  if (error) return page(unsubscribePage(l, 'gone', ''), 502);
  return page(unsubscribePage(l, data?.length ? 'done' : 'gone', ''));
}
