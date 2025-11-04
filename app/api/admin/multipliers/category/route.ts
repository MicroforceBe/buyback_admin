import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get('category') || '').trim();
  if (!category)
    return NextResponse.json({ error: 'category vereist' }, { status: 400 });

  // 1) Alle modellen binnen deze categorie
  const { data: rows, error: e1 } = await supabase
    .from('buyback_catalog')
    .select('model')
    .eq('category', category)
    .eq('active', true)
    .order('model', { ascending: true });

  if (e1)
    return NextResponse.json({ error: e1.message }, { status: 500 });

  const models = Array.from(new Set((rows ?? []).map(r => r.model))).map(m => ({ model: m }));

  // 2) Modellen met een custom JSON
  const { data: customs } = await supabase
    .from('buyback_multipliers_per_model_json')
    .select('model');

  const customSet = new Set((customs ?? []).map(r => r.model));

  const modelsDecorated = models.map(m => ({
    model: m.model,
    uses_category: !customSet.has(m.model),
    has_custom: customSet.has(m.model),
  }));

  // 3) Basis JSON van de categorie
  const { data: base } = await supabase
    .from('buyback_multipliers_per_category_json')
    .select('questions_json, tips_json')
    .eq('category', category)
    .maybeSingle();

  return NextResponse.json({
    models: modelsDecorated,
    base: base ? { questions: base.questions_json ?? {}, tips: base.tips_json ?? {} } : null,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const category = (body?.category || '').trim();
  const questions = body?.questions || {};
  const tips = body?.tips || {};

  if (!category)
    return NextResponse.json({ error: 'category vereist' }, { status: 400 });

  const { error } = await supabase
    .from('buyback_multipliers_per_category_json')
    .upsert(
      {
        category,
        questions_json: questions,
        tips_json: tips,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'category' }
    );

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
