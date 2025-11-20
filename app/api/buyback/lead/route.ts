// app/api/buyback/lead/route.ts
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

/**
 * Eenvoudige helper om van de ruwe `answers` JSON een HTML-tabel te maken.
 * Voor nu gebruiken we gewoon de keys en values; later kan dit uitgebreid
 * worden met labels uit buyback_multipliers_per_category_json.
 *
 * ⚠️ Dit is nu enkel nog een *fallback* als de widget geen
 * `questions_answers_html` meestuurt.
 */
function buildQuestionsAnswersHtml(rawAnswers: any): string {
  if (!rawAnswers || typeof rawAnswers !== 'object') return '';

  const entries = Array.isArray(rawAnswers)
    ? rawAnswers.map((v, i) => [String(i), v] as [string, any])
    : Object.entries(rawAnswers as Record<string, any>);

  if (entries.length === 0) return '';

  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const rows: string[] = [];

  for (const [key, value] of entries) {
    let valueStr: string;
    if (value === null || value === undefined) {
      valueStr = '';
    } else if (typeof value === 'object') {
      try {
        valueStr = JSON.stringify(value);
      } catch {
        valueStr = String(value);
      }
    } else {
      valueStr = String(value);
    }

    rows.push(`
      <tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;width:45%;color:#6b7280;">
          ${escapeHtml(key)}
        </td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;">
          ${escapeHtml(valueStr)}
        </td>
      </tr>
    `);
  }

  return `
    <h3 style="margin:18px 0 6px;font-size:14px;">Vragen en antwoorden</h3>
    <table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;">
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `;
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
    variant = null;
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

  // 🧠 NIEUW: HTML uit de widget gebruiken als die bestaat
  let questions_answers_html: string | null = null;
  if (typeof body?.questions_answers_html === 'string' && body.questions_answers_html.trim()) {
    questions_answers_html = body.questions_answers_html;
    console.info('[ADMIN][LEAD] using questions_answers_html from widget');
  } else {
    questions_answers_html = buildQuestionsAnswersHtml(answers);
    console.info('[ADMIN][LEAD] using server-side fallback questions_answers_html');
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
      variant: variant || null,
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
      questions_answers_html, // ⬅️ hier komt nu de widget-HTML terecht
    }])
    .select('id, order_code, email')
    .single();

  if (error) return j({ error: error.message }, 500);

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
      base_price_cents,
      final_price_cents: wants_voucher ? final_price_with_voucher_cents : final_price_cents,
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
