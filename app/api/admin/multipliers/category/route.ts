// app/api/admin/multipliers/category/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sb() {
  const any: any = supabaseAdminExport as any;
  return typeof any === 'function' ? any() : any;
}

export async function GET(req: Request) {
  const s = sb();
  const url = new URL(req.url);
  const category = (url.searchParams.get('category') || '').trim();
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  // Base category JSON (indien aanwezig)
  const { data: catRow } = await s
    .from('buyback_multipliers_per_category_json')
    .select('questions_json,tips_json,updated_at')
    .eq('category', category)
    .maybeSingle();

  // Alle modellen in deze categorie
  const { data: modelsData, error: e1 } = await s
    .from('buyback_catalog')
    .select('model')
    .eq('category', category)
    .eq('active', true)
    .order('model', { ascending: true });

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const models = Array.from(new Set((modelsData ?? []).map((r: any) => r.model))).filter(Boolean);

  // Bepaal welke modellen custom overrides hebben
  const { data: pm } = await s
    .from('buyback_multipliers_per_model_json')
    .select('model')
    .in('model', models);

  const customSet = new Set((pm ?? []).map((r: any) => r.model));

  return NextResponse.json({
    category,
    base: {
      questions: (catRow?.questions_json ?? {}) as any,
      tips: (catRow?.tips_json ?? {}) as any,
      updated_at: catRow?.updated_at ?? null,
    },
    models: models.map(m => ({
      model: m,
      uses_category: !customSet.has(m), // true = geen per-model rij
      has_custom: customSet.has(m),
    })),
  });
}

export async function POST(req: Request) {
  const s = sb();
  const body = await req.json().catch(() => ({}));
  const category = (body?.category || '').trim();
  const questions = body?.questions ?? {};
  const tips = body?.tips ?? {};

  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  const { error } = await s
    .from('buyback_multipliers_per_category_json')
    .upsert(
      { category, questions_json: questions, tips_json: tips, updated_at: new Date().toISOString() },
      { onConflict: 'category' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
