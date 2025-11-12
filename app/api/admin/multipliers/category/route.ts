// app/api/admin/multipliers/category/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? '';
  if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 });

  const sb = supabaseAdmin;

  // Lees de hele JSON-structuur (incl. tips + volgorde)
  const { data: row, error } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_JSON, updated_at')
    .eq('category', category)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const qj = (row?.questions_JSON ?? {}) as any;
  const questions = qj.questions ?? qj ?? {}; // fallback: oudere schema’s waar questions_JSON direct de vragen bevat
  const tips = qj.tips ?? {};
  const ord: string[] =
    (Array.isArray(qj.order) && qj.order) ||
    (Array.isArray(qj.q_order) && qj.q_order) ||
    (Array.isArray(qj.questions_order) && qj.questions_order) ||
    Object.keys(questions);

  // Modellen (pas evt. kolomnamen aan naar jullie catalog)
  const { data: modelsRows, error: modelsErr } = await sb
    .from('buyback_catalog')
    .select('model')
    .eq('category', category);

  if (modelsErr) return NextResponse.json({ error: modelsErr.message }, { status: 500 });

  const uniqModels = Array.from(new Set((modelsRows ?? []).map(r => r.model).filter(Boolean)));
  const models = uniqModels.map((m) => ({
    model: m as string,
    uses_category: true,
    has_custom: false,
    assigned_set: null as string | null,
  }));

  return NextResponse.json({
    base: {
      questions,
      tips,
      order: ord,
      q_order: ord,
      questions_order: ord,
      updated_at: row?.updated_at ?? null,
    },
    models,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    category,
    questions,
    tips = {},
    // een van deze kan gezet zijn door de client
    order,
    q_order,
    questions_order,
  } = body as {
    category: string;
    questions: Record<string, any>;
    tips?: Record<string, string>;
    order?: string[];
    q_order?: string[];
    questions_order?: string[];
  };

  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  // Kies één consistente volgorde-key om op te slaan (we nemen 'order')
  const ord: string[] =
    (Array.isArray(order) && order) ||
    (Array.isArray(q_order) && q_order) ||
    (Array.isArray(questions_order) && questions_order) ||
    Object.keys(questions ?? {});

  const sb = supabaseAdmin;

  // Schrijf alles gecapsuleerd in questions_JSON
  const payload = {
    category,
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
