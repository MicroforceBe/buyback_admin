import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendStatusMail } from '@/app/api/buyback/email/sendStatusMail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Gebruik server-only vars (service role) */
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  return j({ ok: true, expects: 'POST', table: 'buyback_leads' }, 200);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } });
}

/** (Optioneel) helpers — momenteel niet gebruikt
function yymmddUTC() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}
function utcRangeToday() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}
*/

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') || '';
  const raw = await req.text(); // altijd eerst ruwe body
  
  // zet korte log (max 500 chars) — zichtbaar in Vercel → Project → Deployments → Logs (Runtime)
  console.log('[ADMIN][LEAD] content-type =', ct);
  console.log('[ADMIN][LEAD] raw body preview =', raw.slice(0, 500));
  
  if (!raw || !raw.trim()) {
    return j({ error: 'Empty body (no JSON received)' }, 400);
  }
  
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch (e: any) {
    return j({
      error: 'Invalid JSON',
      message: String(e?.message || e),
      hint: 'Controleer aanhalingstekens en header content-type: application/json',
      received_preview: raw.slice(0, 200)
    }, 400);
  }

  const {
    source = 'shopify-bb2',
    model,
    capacity_gb = null,
    answers,
    base_price_cents,
    final_price_cents,

    // klant
    first_name = null,
    last_name = null,
    customer_name = null, // backward compat
    email = null,
    phone = null,
    street = null,
    house_number = null,
    postal_code = null,
    city = null,
    country = null,
    iban = null,
    delivery_method = null,   // 'ship' | 'dropoff'

    // winkel (NIEUW)
    shop_id = null,           // uuid -> buyback_shops.id
    shop_location = null,     // compat: naam

    // voucher
    wants_voucher = false,

    // idempotency (optioneel)
    idempotency_key = null,
  } = body || {};

  if (!model || !answers || typeof base_price_cents !== 'number' || typeof final_price_cents !== 'number') {
    return j({ error: 'Missing fields: model, answers, base_price_cents, final_price_cents' }, 400);
  }

  // Idempotency: als dezelfde key al eerder gebruikt werd, geef dat record terug
  if (idempotency_key) {
    const { data: existing } = await supabase
      .from('buyback_leads')
      .select('id, order_code')
      .eq('idempotency_key', idempotency_key)
      .single();
    if (existing) {
      return j({ ok: true, id: existing.id, order_code: existing.order_code ?? existing.id }, 200);
    }
  }

  // voucher +5% — afronden op 5 euro (zoals in de widget)
  let voucher_bonus_cents = 0;
  let final_price_with_voucher_cents = final_price_cents;
  if (wants_voucher) {
    const withBonus = Math.round(final_price_cents * 1.05);
    final_price_with_voucher_cents = Math.round(withBonus / 500) * 500;
    voucher_bonus_cents = final_price_with_voucher_cents - final_price_cents;
  }

  // Als er een shop_id is, haal naam/adres/openingsuren op (maildetails)
  let resolved_shop_location = shop_location as string | null;
  let shop_address1: string | null = null;
  let shop_zip: string | null = null;
  let shop_city: string | null = null;
  let opening_hours: any = null;

  if (shop_id) {
    const { data: shopRow, error: shopErr } = await supabase
      .from('buyback_shops')
      .select('name, address1, zip, city, opening_hours')
      .eq('id', shop_id)
      .single();
    if (!shopErr && shopRow) {
      resolved_shop_location = shopRow.name ?? resolved_shop_location ?? null;
      shop_address1 = shopRow.address1 ?? null;
      shop_zip = shopRow.zip ?? null;
      shop_city = shopRow.city ?? null;
      opening_hours = shopRow.opening_hours ?? null;
    } else if (!resolved_shop_location) {
      // fallback: als we geen rij kregen en ook geen naam, laat compat-naam ongewijzigd (kan null zijn)
      console.warn('[ADMIN][LEAD] shop lookup failed or missing; continuing without shop details');
    }
  }

  // Order code volgens jouw oude formaat 'BB########' via RPC
  const { data: ocData, error: ocErr } = await supabase.rpc('next_buyback_order_code_global', { prefix: 'BB' });
  if (ocErr || !ocData) return j({ error: ocErr?.message || 'Could not allocate order code' }, 500);
  const order_code: string = String(ocData);

  // Insert met order_code, idempotency_key en shop_id + shop_location (compat)
  const { data, error } = await supabase
    .from('buyback_leads')
    .insert([{
      source, model, capacity_gb, answers,
      base_price_cents, final_price_cents,
      final_price_with_voucher_cents, voucher_bonus_cents,
      first_name, last_name, customer_name,
      email, phone,
      street, house_number, postal_code, city, country,
      iban, delivery_method,
      shop_id: shop_id || null,
      shop_location: resolved_shop_location || shop_location || null,
      wants_voucher,
      order_code,
      idempotency_key,
    }])
    .select('id, order_code, email')
    .single();

  if (error) return j({ error: error.message }, 500);

  // === MAIL: stuur professionele bevestigingsmail ===
  // Niet-blockerend voor de response; errors worden gelogd.
  const recipientEmail = data?.email ?? email ?? null;
  if (recipientEmail) {
    console.log('[ADMIN][LEAD][MAIL] queue confirm mail', { order_code, to: recipientEmail });
// === MAIL: stuur professionele bevestigingsmail ===
(async () => {
  try {
    const mailRes = await sendStatusMail({
      email: data?.email ?? email ?? null,
      first_name,
      last_name,
      order_code,
      model,
      capacity_gb,
      final_price_cents: wants_voucher ? final_price_with_voucher_cents : final_price_cents,
      wants_voucher,
      iban: wants_voucher ? null : (iban ?? null),
      delivery_method,
      shop_location: resolved_shop_location ?? shop_location ?? null,
      shop_address1,
      shop_zip,
      shop_city,
      opening_hours,
    });
    console.log("[ADMIN][LEAD][MAIL] sent ok:", mailRes);
  } catch (mailErr) {
    console.error("[ADMIN][LEAD][MAIL] sendStatusMail failed:", mailErr);
  }
})();
  } else {
    console.log('[ADMIN][LEAD][MAIL] skip — no recipient email', { order_code });
  }

  return j({ ok: true, id: data?.id, order_code: data?.order_code }, 201);
}
