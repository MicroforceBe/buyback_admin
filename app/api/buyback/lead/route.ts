// app/api/buyback/lead/route.ts
import { NextResponse } from 'next/server';
import { verifyLeadPrice, LeadPriceError } from '@/lib/verifyLeadPrice';
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

// Log only a fixed stage and validated database error code, never message/details or form data.
function storageFailure(stage: 'order_code' | 'insert', error: any) {
  const code = typeof error?.code === 'string' && /^(?:PGRST[0-9]{3}|[0-9A-Z]{5})$/.test(error.code)
    ? error.code : 'UNKNOWN';
  console.error('[TEST_LEAD_STORAGE_FAILURE]', { stage, code });
  return j({ error: 'Testaanvraag kon niet opgeslagen worden.', stage, code }, 500);
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
      hint: 'Controleer aanhalingstekens en header content-type: application/json'
    }, 400);
  }

  const {
    source = 'shopify-bb2',
    model,
    variant = null,
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

  let quote: Awaited<ReturnType<typeof verifyLeadPrice>>;
  try {
    quote = await verifyLeadPrice(supabase, body);
  } catch (error) {
    if (error instanceof LeadPriceError) return j({ error: error.message, code: error.code }, error.status);
    return j({ error: 'Prijscontrole tijdelijk niet beschikbaar.', code: 'QUOTE_UNAVAILABLE' }, 503);
  }
  // Generate text from validated answers; never trust client-supplied email HTML.
  const questions_answers_html = quote.questions_answers_html;

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

  const { voucher_bonus_cents, final_price_with_voucher_cents } = quote;

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
  if (ocErr || !ocData) return storageFailure('order_code', ocErr);
  const order_code: string = String(ocData);

  // Insert met order_code, idempotency_key en shop_id + shop_location (compat)
  const { data, error } = await supabase
    .from('buyback_leads')
    .insert([{
      source, model, capacity_gb, answers,
      variant: variant || null,
      base_price_cents: quote.base_price_cents, final_price_cents: quote.final_price_cents,
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
      questions_answers_html, // Safe labels from the verified catalog.
    }])
    .select('id, order_code, email')
    .single();

  if (error) return storageFailure('insert', error);

  // === MAIL: stuur professionele bevestigingsmail (BLOCKING) ===
  try {
    const to = (data?.email ?? email ?? null) as string | null;

    console.info('[ADMIN][LEAD][MAIL] will send', {
      to,
      order_code,
      wants_voucher,
      delivery_method,
    });

    const mailRes = await sendStatusMail({
      to,                       // ontvanger
      first_name,
      last_name,
      order_code,

      // toestel & prijs
      model,
      capacity_gb,
      variant: variant || null,   // ⬅️ VARIANT HIER MEEGEVEN
      base_price_cents: quote.base_price_cents,
      final_price_cents: wants_voucher ? final_price_with_voucher_cents : quote.final_price_cents,
      wants_voucher,

      // antwoorden/conditie uit de widget (ruw object én HTML)
      answers,
      questions_answers_html: questions_answers_html ?? null,

      // uitbetaling
      iban: wants_voucher ? null : (iban ?? null),
      delivery_method,

      // winkel (dropoff)
      shop_location: resolved_shop_location ?? shop_location ?? null,
      shop_address1,
      shop_zip,
      shop_city,
      opening_hours,

      // klantadres (ship)
      street,
      house_number,
      postal_code,
      city,
      country,
    });

    console.info('[ADMIN][LEAD][MAIL] sent ok', {
      id: (mailRes as any)?.id,
      to,
      order_code,
    });
  } catch (mailErr: any) {
    console.error('[ADMIN][LEAD][MAIL] send failed', {
      err: mailErr?.message || String(mailErr),
      order_code,
    });
  }

  // Response pas NA de mail
  return j({ ok: true, id: data?.id, order_code: data?.order_code }, 201);
}

