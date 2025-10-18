import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function j(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET() {
  // Healthcheck: zo kan je in de browser zien dat de route bestaat
  return j({ ok: true, expects: 'POST', table: 'buyback_leads' }, 200);
}

export async function OPTIONS() {
  // Voor de volledigheid (preflight). Niet strikt nodig, maar netjes.
  return new NextResponse(null, {
    status: 204,
    headers: { 'Allow': 'GET, POST, OPTIONS' },
  });
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
    customer_name = null,
    email = null,
    phone = null,
    shop_location = null,
  } = body || {};

  if (!model || !answers || typeof base_price_cents !== 'number' || typeof final_price_cents !== 'number') {
    return j({ error: 'Missing fields: model, answers, base_price_cents, final_price_cents' }, 400);
  }

  const { data, error } = await supabase
    .from('buyback_leads')
    .insert([{
      source, model, capacity_gb, answers,
      base_price_cents, final_price_cents,
      customer_name, email, phone, shop_location
    }])
    .select('id')
    .single();

  if (error) return j({ error: error.message }, 500);
  return j({ ok: true, id: data?.id }, 201);
}
