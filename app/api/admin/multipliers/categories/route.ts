import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const sb = typeof (supabaseAdmin as any) === 'function' ? (supabaseAdmin as any)() : supabaseAdmin;

  const { data: catRows, error: catErr } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null);

  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  const categories = Array.from(new Set((catRows || []).map((r: any) => String(r.category).trim())));

  const { data: jsonRows } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category');

  const has = new Set((jsonRows || []).map((r: any) => String(r.category).trim()));

  const payload = categories.map((name) => ({ name, has_json: has.has(name) }));
  return NextResponse.json({ categories: payload });
  const { data: imacRows, error: imacErr } = await sb
  .from('buyback_catalog')
  .select('category')
  .ilike('category', '%imac%');

return NextResponse.json({
  debug: {
    imacErr: imacErr?.message ?? null,
    imacRows,
    totalRows: catRows?.length ?? 0,
  },
  categories: payload,
});

}
