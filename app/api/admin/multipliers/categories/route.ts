// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function hasQuestions(row: any): boolean {
  const qj = row?.questions_JSON ?? row?.questions_json ?? {};
  const qs = qj?.questions ?? qj ?? {};
  return qs && typeof qs === 'object' && Object.keys(qs).length > 0;
}

export async function GET() {
  const sb = supabaseAdmin;

  // Alle categorieën uit catalog
  const { data: catRows, error: catErr } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null);

  if (catErr) {
    return NextResponse.json({ error: catErr.message }, { status: 500 });
  }

  const allCats = Array.from(new Set((catRows ?? []).map((r: any) => String(r.category)).filter(Boolean)));

  // Check of er een basis-set bestaat in de JSON-tabel
  const { data: baseRows, error: baseErr } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_JSON, questions_json');

  if (baseErr) {
    return NextResponse.json({ error: baseErr.message }, { status: 500 });
  }

  const hasMap = new Map<string, boolean>();
  for (const r of baseRows ?? []) {
    hasMap.set(r.category, hasQuestions(r));
  }

  const categories = allCats.map((name) => ({
    name,
    has_json: !!hasMap.get(name),
  }));

  return NextResponse.json({ categories }, {
    headers: { 'cache-control': 'no-store, no-cache, must-revalidate' },
  });
}
