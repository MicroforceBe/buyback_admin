// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const sb = supabaseAdmin;

  // Alle categorieën uit catalog (pas aan indien nodig)
  const { data: catRows, error: catErr } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null);

  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

  const allCats = Array.from(new Set((catRows ?? []).map(r => r.category))).filter(Boolean) as string[];

  // Bestaan van basis-set (questions_JSON mag nested zijn)
  const { data: baseRows } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_JSON');

  const hasMap = new Map<string, boolean>();
  for (const r of baseRows ?? []) {
    const qj = (r as any).questions_JSON ?? {};
    const qs = qj.questions ?? qj; // wederom backwards-compat
    const has = qs && typeof qs === 'object' && Object.keys(qs).length > 0;
    hasMap.set((r as any).category, !!has);
  }

  const categories = allCats.map((name) => ({
    name,
    has_json: !!hasMap.get(name),
  }));

  return NextResponse.json({ categories });
}
