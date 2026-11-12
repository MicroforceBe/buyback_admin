import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { adminBaseUrl, configLabel, confirmationMail, modelName, parseRequest, pickImages, unsubscribeUrl, type MailItem } from '@/lib/stockRequests/core';
import { fetchCollection, shopClient } from '@/lib/stockRequests/shop';
import { sendShopMail } from '@/lib/stockRequests/mail';

// Publiek: een klant vraagt op een MacBook-modelpagina van microforce.be (blok "Op aanvraag", snippets/model-op-aanvraag.liquid)
// een mail zodra één of meer configuraties terug op voorraad zijn. Body (JSON): name, email, language, collection, configs
// (["M2/16GB/1TB", …]), grades ([3,4,5]: Behoorlijk, Zeer goed, Als nieuw), consent (true), website (val voor bots, leeg). Labels maakt de server zelf.
// Alleen vanaf de webshop (CORS en Origin); begrensd per IP (gehasht) en per e-mailadres. Stuurt een bevestigingsmail
// (hoogstens 3 per adres per 24 uur, 100 per uur in totaal). Naam: alleen letters, max. 60 tekens, geen links.
export const dynamic = 'force-dynamic';

function origins(): string[] {
  const env = (process.env.PUBLIC_SHOP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return env.length ? env : ['https://microforce.be', 'https://www.microforce.be'];
}

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const headers: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' };
  if (origins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

function ipHash(request: Request): string | null {
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  const key = process.env.CRON_SECRET;
  return ip && key ? createHmac('sha256', key).update('stock-request:' + ip).digest('hex') : null;
}

export async function POST(request: Request) {
  const headers = cors(request);
  if (!origins().includes(request.headers.get('origin') || '')) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers });
  const raw = await request.text();
  if (raw.length > 4000) return NextResponse.json({ error: 'invalid' }, { status: 400, headers });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'invalid' }, { status: 400, headers }); }
  const parsed = parseRequest(body);
  if (!parsed.ok) {
    // Bots krijgen een gewoon "ok" terug, zonder dat er iets bewaard wordt.
    if (parsed.error === 'spam') return NextResponse.json({ ok: true }, { headers });
    return NextResponse.json({ error: parsed.error }, { status: 400, headers });
  }
  const v = parsed.value;
  const { data: token, error } = await supabaseAdmin.rpc('submit_shop_stock_request', {
    p_name: v.name, p_email: v.email, p_language: v.language, p_collection: v.collection,
    p_configs: v.keys.map(key => ({ key, label: configLabel(key, 'nl') })), p_grades: v.grades, p_ip_hash: ipHash(request), p_consent_version: v.consentVersion,
  });
  if (error || typeof token !== 'string') {
    if (error?.message?.includes('STOCK_REQUEST_RATE_LIMIT')) return NextResponse.json({ error: 'rate' }, { status: 429, headers });
    console.error('[STOCK REQUEST] save failed');
    return NextResponse.json({ error: 'failed' }, { status: error?.code === '23514' ? 400 : 502, headers });
  }
  try {
    // Hoogstens 3 bevestigingsmails per e-mailadres per 24 uur en 100 per uur in totaal; daarboven wordt de aanvraag wel
    // bewaard, maar vertrekt er geen bevestiging (tegen misbruik van het formulier als spamkanaal).
    const { data: mag } = await supabaseAdmin.rpc('claim_shop_stock_confirmation', { p_email: v.email });
    if (mag !== true) return NextResponse.json({ ok: true }, { headers });
    const link = unsubscribeUrl(adminBaseUrl(process.env), token, v.language);
    // Modelnaam en een foto van het model uit Shopify; lukt dat niet, dan gaat de mail zonder.
    let items: MailItem[] = v.keys.map(key => ({ key }));
    try {
      const client = shopClient();
      const c = client ? await fetchCollection(client, v.collection) : null;
      if (c) { const img = pickImages(v.keys, c.products); items = v.keys.map(key => ({ key, model: modelName(c.title), image: img[key] })); }
    } catch { /* zonder foto */ }
    await sendShopMail(v.email, confirmationMail(v.language, v.name, items, v.grades, link, v.collection), link);
  } catch {
    console.error('[STOCK REQUEST] confirmation mail failed'); // de aanvraag zelf is bewaard
  }
  return NextResponse.json({ ok: true }, { headers });
}
