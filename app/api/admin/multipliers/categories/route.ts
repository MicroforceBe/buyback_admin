// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

// Ondersteun zowel een object-export als een factory-functie
function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

function hasQuestions(row: any): boolean {
  const qj = row?.questions_JSON ?? row?.questions_json ?? {};
  const qs = qj?.questions ?? qj ?? {};
  return !!qs && typeof qs === 'object' && Object.keys(qs).length > 0;
}

export async function GET() {
  const sb = sbClient();

  let catFromCatalog: string[] = [];
  let catFromJson: string[] = [];
  let jsonRows: any[] = [];

  // 1) Categorieën uit catalog (mag falen zonder alles te breken)
  const { data: catRows, error: catErr } = await sb
    .from('buyback_catalog')
    .select('category')
    .not('category', 'is', null);

  if (!catErr && Array.isArray(catRows)) {
    catFromCatalog = catRows
      .map((r: any) => String(r.category ?? '').trim())
      .filter(Boolean);
  }

  // 2) Categorieën uit JSON-tabel (fallback + voor has_json)
  const { data: baseRows, error: baseErr } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_JSON, questions_json');

  if (!baseErr && Array.isArray(baseRows)) {
    jsonRows = baseRows;
    catFromJson = baseRows
      .map((r: any) => String(r.category ?? '').trim())
      .filter(Boolean);
  }

  // Unieke lijst (catalog ∪ json)
  const uniqSet = new Set<string>([...catFromCatalog, ...catFromJson]);
  const allCats = Array.from(uniqSet);

  // has_json map
  const hasMap = new Map<string, boolean>();
  for (const r of jsonRows) {
    if (!r?.category) continue;
    hasMap.set(String(r.category), hasQuestions(r));
  }

  // Bouw resultaat; als er echt niets is, geef lege array i.p.v. 500
  const categories = allCats.map((name) => ({
    name,
    has_json: !!hasMap.get(name),
  }));

  return NextResponse.json(
    { categories },
    { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } }
  );
}
