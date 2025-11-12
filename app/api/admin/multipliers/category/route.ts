// app/api/admin/multipliers/category/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

type QOption = {
  key: string;
  label?: string | null;
  tip?: string | null;
  type: 'percent' | 'fixed';
  value: number;
  priority?: number | null;
  active?: boolean | null;
};

type Questions = Record<string, { title?: string | null; options: QOption[] }>;

function extractBase(obj: any): {
  questions: Questions;
  tips: Record<string, string>;
  order: string[];
} {
  const qj = obj ?? {};
  // Kolom kan 'questions_JSON' of 'questions_json' zijn
  const raw = qj.questions_JSON ?? qj.questions_json ?? qj;

  // Ondersteun 2 vormen:
  // 1) { questions, tips?, order?/q_order?/questions_order? }
  // 2) direct { <vraagKey>: {title, options}, ... }
  const questions: Questions = raw?.questions ?? raw ?? {};
  const tips: Record<string, string> = raw?.tips ?? {};
  const ord: string[] =
    (Array.isArray(raw?.order) && raw.order) ||
    (Array.isArray(raw?.q_order) && raw.q_order) ||
    (Array.isArray(raw?.questions_order) && raw.questions_order) ||
    Object.keys(questions);

  return { questions, tips, order: ord };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? '';
  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }

  const sb = supabaseAdmin;

  // 1) Basis-set uit buyback_multipliers_per_category_json
  const { data: baseRow, error: baseErr } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_JSON, questions_json, updated_at')
    .eq('category', category)
    .maybeSingle();

  if (baseErr) {
    return NextResponse.json({ error: baseErr.message }, { status: 500 });
  }

  const base = extractBase(baseRow);

  // 2) Modellen uit buyback_catalog voor deze categorie
  const { data: modelRows, error: modelErr } = await sb
    .from('buyback_catalog')
    .select('model, category')
    .eq('category', category);

  if (modelErr) {
    return NextResponse.json({ error: modelErr.message }, { status: 500 });
  }

  const uniqModels = Array.from(
    new Set((modelRows ?? []).map((r: any) => String(r.model ?? '')).filter(Boolean))
  );

  const models = uniqModels.map((m) => ({
    model: m,
    uses_category: true,   // default: categorie-set actief tot je custom toewijst
    has_custom: false,
    assigned_set: null as string | null,
  }));

  return NextResponse.json({
    base: {
      questions: base.questions,
      tips: base.tips,
      order: base.order,
      q_order: base.order,
      questions_order: base.order,
      updated_at: baseRow?.updated_at ?? null,
    },
    models,
  }, {
    headers: {
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    category,
    questions,
    tips = {},
    order,
    q_order,
    questions_order,
  } = body as {
    category: string;
    questions: Questions;
    tips?: Record<string, string>;
    order?: string[];
    q_order?: string[];
    questions_order?: string[];
  };

  if (!category) {
    return NextResponse.json({ error: 'category required' }, { status: 400 });
  }

  const ord: string[] =
    (Array.isArray(order) && order) ||
    (Array.isArray(q_order) && q_order) ||
    (Array.isArray(questions_order) && questions_order) ||
    Object.keys(questions ?? {});

  const sb = supabaseAdmin;

  const payload = {
    category,
    // Bewaar ALLES genest in questions_JSON
    questions_JSON: {
      questions: questions ?? {},
      tips: tips ?? {},
      order: ord,
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from('buyback_multipliers_per_category_json')
    .upsert(payload, { onConflict: 'category' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, {
    headers: { 'cache-control': 'no-store, no-cache, must-revalidate' },
  });
}
