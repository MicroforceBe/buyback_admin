import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

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
      .select('id, order_code, email')
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

  // Als er een shop_id is, en geen naam, haal de naam (compat) op
  let resolved_shop_location = shop_location;
  if (shop_id && !resolved_shop_location) {
    const { data: shopRow, error: shopErr } = await supabase
      .from('buyback_shops')
      .select('name')
      .eq('id', shop_id)
      .single();
    if (!shopErr && shopRow?.name) {
      resolved_shop_location = shopRow.name;
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

  // ===== Klant-bevestigingsmail (best effort, non-blocking) =====
  try {
    const to = (data?.email || email || '').trim();
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const FROM = process.env.MAIL_FROM;          // bv. "Microforce Buyback <info@microforce.be>"
    const REPLY_TO = process.env.MAIL_REPLY_TO || FROM;

    if (RESEND_API_KEY && FROM && to) {
      const resend = new Resend(RESEND_API_KEY);

      const subject = `Bevestiging buyback-aanvraag ${order_code}`;
      const euro = (cents: number | null | undefined) =>
        typeof cents === 'number' ? (cents / 100).toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' }) : '—';

      const prijsRegel = wants_voucher
        ? `${euro(final_price_with_voucher_cents)} <small style="color:#166534;">(incl. +5% voucher — was ${euro(final_price_cents)})</small>`
        : euro(final_price_cents);

      const leverRegel = delivery_method === 'dropoff'
        ? `Binnenbrengen in winkel${resolved_shop_location ? `: <strong>${resolved_shop_location}</strong>` : ''}`
        : 'Verzenden (we bezorgen je zo meteen verdere instructies)';

      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111827;">
          <h2 style="margin:0 0 8px">Bedankt voor je buyback-aanvraag</h2>
          <p style="margin:0 0 16px">We hebben je aanvraag goed ontvangen.</p>

          <table style="border-collapse:collapse;width:100%;max-width:620px">
            <tr>
              <td style="padding:8px 0;width:180px;color:#6b7280;">Referentie</td>
              <td style="padding:8px 0;"><strong style="font-family:ui-monospace,Menlo,Consolas,monospace">${order_code}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Toestel</td>
              <td style="padding:8px 0;">${model ?? '—'}${capacity_gb ? ` • ${capacity_gb} GB` : ''}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Geschatte uitbetaling</td>
              <td style="padding:8px 0;font-size:18px;"><strong>${prijsRegel}</strong></td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;">Levering</td>
              <td style="padding:8px 0;">${leverRegel}</td>
            </tr>
            ${iban && !wants_voucher ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;">IBAN</td>
              <td style="padding:8px 0;">${iban}</td>
            </tr>` : ``}
          </table>

          <p style="margin:16px 0 0;color:#374151;">Je ontvangt binnenkort een vervolgmail met de praktische stappen.</p>
          <p style="margin:4px 0 0;color:#374151;">Vragen? Antwoord gerust op deze mail.</p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
          <p style="margin:0;color:#6b7280;font-size:12px">Microforce Buyback — dit is een automatische bevestiging.</p>
        </div>
      `;

      await resend.emails.send({
        from: FROM,
        to,
        replyTo: REPLY_TO,
        subject,
        html,
      });
      console.log('[ADMIN][LEAD] confirmation mail queued via Resend for', to, 'order', order_code);
    } else {
      console.log('[ADMIN][LEAD] mail not sent — missing RESEND_API_KEY/MAIL_FROM or no recipient email');
    }
  } catch (mailErr: any) {
    console.warn('[ADMIN][LEAD] mail send error:', mailErr?.message || mailErr);
    // niet blokkeren; we geven gewoon de succesvolle response terug
  }

  return j({ ok: true, id: data?.id, order_code: data?.order_code }, 201);
}
