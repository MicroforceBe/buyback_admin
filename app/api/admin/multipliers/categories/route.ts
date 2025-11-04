// app/api/admin/multipliers/categories/route.ts
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // SECURITY DEFINER in de DB zorgt voor juiste rechten
);

export async function GET() {
  try {
    // 1) Unieke categorieën uit catalog
    const { data: catRows, error: e1 } = await supabase
      .from('buyback_catalog')
      .select('category, active')
      .eq('active', true);

    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }

    const cats = Array.from(
      new Set(
        (catRows ?? [])
          .map(r => (r?.category ?? '').toString().trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    // 2) Kijken welke categorieën al een JSON set hebben
    //    Tabel: buyback_multipliers_per_category_json (kolom 'category')
    let hasJsonSet = new Set<string>();
    {
      const { data: jsonRows, error: e2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('category');

      // Best-effort: als tabel (nog) niet bestaat of leeg is -> niemand heeft json
      if (!e2 && Array.isArray(jsonRows)) {
        hasJsonSet = new Set(
          jsonRows
            .map(r => (r?.category ?? '').toString().trim())
            .filter(Boolean)
        );
      }
    }

    const categories = cats.map(name => ({
      name,
      has_json: hasJsonSet.has(name),
    }));

    return NextResponse.json(
      { categories },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
