// app/api/admin/multipliers/model/toggle/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type QType = 'percent' | 'fixed';
type QOption = {
  key: string;
  label?: string | null;
  tip?: string | null;
  type: QType;
  value: number;
  priority?: number | null;
  active?: boolean | null;
};
type QBlock = { title?: string | null; options?: QOption[] };
type Questions = Record<string, QBlock>;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const model = (body?.model || '').trim();
  const category = (body?.category || '').trim();
  const useCategory = !!body?.use_category;

  if (!model || !category) {
    return NextResponse.json({ error: 'model en category vereist' }, { status: 400 });
  }

  if (useCategory) {
    // Terug naar categorie: custom entry verwijderen
    const { error } = await supabase
      .from('buyback_multipliers_per_model_json')
      .delete()
      .eq('model', model);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'category' });
  }

  // Custom aanmaken: kopieer de categorie JSON naar per-model JSON
  const { data: base, error: eBase } = await supabase
    .from('buyback_multipliers_per_category_json')
    .select('questions_json, tips_json')
    .eq('category', category)
    .maybeSingle();

  if (eBase) {
    return NextResponse.json({ error: eBase.message }, { status: 500 });
  }

  const questions = (base?.questions_json ?? {}) as Questions;
  const tips = (base?.tips_json ?? {}) as Record<string, string>;

  // Defensief: als questions géén object is, leeg maken
  const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const qsrc: Questions = isObj(questions) ? (questions as Questions) : {};

  const titles: Record<string, string | null> = {};
  const options: Record<string, any[]> = {};

  for (const [qk, block] of Object.entries(qsrc)) {
    const b: QBlock = isObj(block) ? (block as QBlock) : {};
    titles[qk] = (b?.title ?? null);

    const arr = Array.isArray(b?.options) ? (b!.options as QOption[]) : [];
    options[qk] = arr.map((o) => ({
      key: String(o?.key ?? ''),
      label: o?.label ?? null,
      tip: o?.tip ?? null,
      type: o?.type === 'fixed' ? 'fixed' : 'percent',
      value: Number.isFinite(o?.value as number) ? Number(o!.value) : 1,
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: 'custom' });
}
