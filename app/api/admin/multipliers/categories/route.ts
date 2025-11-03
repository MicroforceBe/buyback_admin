// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sb() {
  const any: any = supabaseAdminExport as any;
  return typeof any === 'function' ? any() : any;
}

export async function GET() {
  const s = sb();

  // Haal alle categorieën uit catalog (distinct)
  const { data, error } = await s
    .from('buyback_catalog')
    .select('category')
    .eq('active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cats = Array.from(
    new Set((data ?? []).map((r: any) => (r.category ?? '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Optioneel: toon of er al category JSON bestaat
  const { data: pc } = await s
    .from('buyback_multipliers_per_category_json')
    .select('category');

  const hasJson = new Set((pc ?? []).map((r: any) => r.category));

  return NextResponse.json({
    categories: cats.map(c => ({ name: c, has_json: hasJson.has(c) }))
  });
}
