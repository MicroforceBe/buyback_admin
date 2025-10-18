import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q       = (searchParams.get('q') ?? '').trim();
  const method  = (searchParams.get('method') ?? '').trim();
  const voucher = (searchParams.get('voucher') ?? '').trim();
  const from    = (searchParams.get('from') ?? '').trim();
  const to      = (searchParams.get('to') ?? '').trim();
  const download= searchParams.get('download');

  let query = supabaseAdmin
    .from('buyback_leads')
    .select(
      [
        'created_at','source','model','capacity_gb',
        'base_price_cents','final_price_cents','final_price_with_voucher_cents','voucher_bonus_cents','wants_voucher',
        'first_name','last_name','email','phone',
        'delivery_method','shop_location',
        'street','house_number','postal_code','city','country','iban',
        'answers','id'
      ].join(',')
    )
    .order('created_at', { ascending: false });

  if (q) {
    query = query.or([
      `model.ilike.%${q}%`,
      `first_name.ilike.%${q}%`,
      `last_name.ilike.%${q}%`,
      `email.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `city.ilike.%${q}%`,
      `shop_location.ilike.%${q}%`
    ].join(','));
  }
  if (method === 'ship')   query = query.eq('delivery_method', 'ship');
  if (method === 'dropoff') query = query.eq('delivery_method', 'dropoff');

  if (voucher === 'yes') query = query.eq('wants_voucher', true);
  if (voucher === 'no')  query = query.or('wants_voucher.is.null,wants_voucher.eq.false');

  if (from) query = query.gte('created_at', `${from}T00:00:00Z`);
  if (to)   query = query.lte('created_at', `${to}T23:59:59.999Z`);

  const { data, error } = await query as any;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as any[];
  const header = [
    'created_at','source','model','capacity_gb',
    'base_price_eur','final_price_eur','final_with_voucher_eur','voucher_bonus_eur','wants_voucher',
    'first_name','last_name','email','phone',
    'delivery_method','shop_location',
    'street','house_number','postal_code','city','country','iban_masked',
    'answers_json','id'
  ];
  const escape = (v: any) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const eur = (cents: number | null | undefined) =>
    (cents ?? 0) / 100;

  const maskIban = (iban: string | null) => {
    if (!iban) return '';
    const clean = iban.replace(/\s+/g, '');
    if (clean.length <= 6) return clean;
    return clean.slice(0, 4) + '************' + clean.slice(-4);
  };

  const lines = [
    header.join(',')
  ];
  for (const r of rows) {
    lines.push([
      escape(r.created_at),
      escape(r.source ?? ''),
      escape(r.model ?? ''),
      r.capacity_gb ?? '',
      eur(r.base_price_cents ?? 0),
      eur(r.final_price_cents ?? 0),
      eur(r.final_price_with_voucher_cents ?? r.final_price_cents ?? 0),
      eur(r.voucher_bonus_cents ?? 0),
      r.wants_voucher ? 'yes' : 'no',
      escape(r.first_name ?? ''),
      escape(r.last_name ?? ''),
      escape(r.email ?? ''),
      escape(r.phone ?? ''),
      escape(r.delivery_method ?? ''),
      escape(r.shop_location ?? ''),
      escape(r.street ?? ''),
      escape(r.house_number ?? ''),
      escape(r.postal_code ?? ''),
      escape(r.city ?? ''),
      escape(r.country ?? ''),
      escape(maskIban(r.iban ?? '')),
      escape(JSON.stringify(r.answers ?? {})),
      escape(r.id)
    ].join(','));
  }

  const csv = lines.join('\n');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      ...(download ? { 'content-disposition': `attachment; filename="buyback-leads.csv"` } : {})
    }
  });
}
