// app/api/admin/multipliers/models/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cat = (searchParams.get('category') || '').trim();

    if (!cat) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('buyback_catalog')
      .select('model, brand, category, active')
      .eq('active', true)
      .eq('category', cat);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Unieke modellen voor de tabel
    const models = Array.from(
      new Set((data ?? []).map((r: any) => String(r.model || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' }));

    return NextResponse.json({ models });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
