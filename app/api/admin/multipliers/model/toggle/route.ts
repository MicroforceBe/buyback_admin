import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const model = (body?.model || '').trim();
  const category = (body?.category || '').trim();
  const useCategory = !!body?.use_category;

  if (!model || !category)
    return NextResponse.json({ error: 'model en category vereist' }, { status: 400 });

  if (useCategory) {
    // Verwijder custom (terug naar categorie)
    const { error } = await supabase
      .from('buyback_multipliers_per_model_json')
      .delete()
      .eq('model', model);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'category' });
  }

  // Custom aanmaken op basis van categorie JSON
  const { data: base } = await supabase
    .from('buyback_multipliers_per_category_json')
    .select('questions_json, tips_json')
    .eq('category', category)
    .maybeSingle();

  const questions = base?.questions_json ?? {};
  const tips = base?.tips_json ?? {};

  const titles: Record<string, string | null> = {};
  const options: Record<string, any[]> = {};
  for (const [qk, block] of Object.entries(questions as any)) {
    titles[qk] = block?.title ?? null;
    options[qk] = (block?.options ?? []).map((o: any) => ({
      key: String(o?.key ?? ''),
      label: o?.label ?? null,
      tip: o?.tip ?? null,
      type: o?.type === 'fixed' ? 'fixed' : 'percent',
      value: Number(o?.value ?? 1),
      priority: o?.priority ?? null,
      active: o?.active ?? true,
    }));
  }

  const { error } = await supabase
    .from('buyback_multipliers_per_model_json')
    .upsert(
      {
        model,
        titles,
        options,
        tips,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'model' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, mode: 'custom' });
}
