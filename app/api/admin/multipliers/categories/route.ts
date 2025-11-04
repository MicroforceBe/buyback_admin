// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // SECURITY DEFINER dekt dit
);

export async function GET() {
  try {
    // Haal distinct categories uit buyback_catalog (alleen niet-lege + active)
    const { data, error } = await supabase
      .from('buyback_catalog')
      .select('category, active')
      .not('category', 'is', null)
      .neq('category', '')
      .eq('active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const cats = Array.from(
      new Set((data ?? []).map((r: any) => String(r.category || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));

    return NextResponse.json({ categories: cats });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
