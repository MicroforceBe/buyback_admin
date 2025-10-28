import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

/** Helpers voor order_code generatie */
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

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return j({ error: 'Invalid JSON' }, 400); }

  const {
    source = 'shopify-bb2',
    model,
    capacity_gb = null,
    answers,
    base_price_cents,
    final_price_cents,

    // nieuw:
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
    shop_location = null,     // bij dropoff
    wants_voucher = false,

    // optioneel:
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

  // voucher +5% afronden op 5 euro (zoals in de widget)
  let voucher_bonus_cents = 0;
  let final_price_with_voucher_cents = final_price_cents;
  if (wants_voucher) {
    const withBonus = Math.round(final_price_cents * 1.05);
    final_price_with_voucher_cents = Math.round(withBonus / 500) * 500;
    voucher_bonus_cents = final_price_with_voucher_cents - final_price_cents;
  }

  // ✅ NIEUW: vraag de volgende code op volgens jouw oude formaat 'BB########'
  const { data: ocData, error: ocErr } = await supabase.rpc('next_buyback_order_code_global', { prefix: 'BB' });
  if (ocErr || !ocData) return j({ error: ocErr?.message || 'Could not allocate order code' }, 500);
  const order_code: string = String(ocData);

  // Insert met order_code (en idempotency_key als je die kolom hebt)
  const { data, error } = await supabase
    .from('buyback_leads')
    .insert([{
      source, model, capacity_gb, answers,
      base_price_cents, final_price_cents,
      final_price_with_voucher_cents, voucher_bonus_cents,
      first_name, last_name, customer_name,
      email, phone,
      street, house_number, postal_code, city, country,
      iban, delivery_method, shop_location,
      wants_voucher,
      order_code,
      idempotency_key,
    }])
    .select('id, order_code')
    .single();

  if (error) return j({ error: error.message }, 500);
  return j({ ok: true, id: data?.id, order_code: data?.order_code }, 201);
}
