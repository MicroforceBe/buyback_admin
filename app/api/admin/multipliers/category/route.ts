// app/api/admin/multipliers/category/route.ts
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
type Questions = Record<string, { title?: string | null; options: QOption[] }>;

function extractBase(row: any): {
  questions: Questions;
  tips: Record<string, string>;
  order: string[];
} {
  const container = row?.questions_JSON ?? row?.questions_json ?? {};
  // Ondersteun twee vormen: genest of plat
  const questions: Questions = container?.questions ?? container ?? {};
  const tips: Record<string, string> = container?.tips ?? {};
  const order: string[] =
    (Array.isArray(container?.order) && container.order) ||
    (Array.isArray(container?.q_order) && container.q_order) ||
    (Array.isArray(container?.questions_order) && container.questions_order) ||
    Object.keys(questions);

  return { questions, tips, order };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get('category') || '').trim();
  if (!category) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }

  const sb = sbClient();

  // 1) Basis set uit JSON-tabel (mag leeg zijn; maar niet crashen)
  let baseRow: any = null;
  {
    const { data, error } = await sb
      .from('buyback_multipliers_per_category_json')
      .select('category, questions_JSON, questions_json, updated_at')
      .eq('category', category)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found; andere errors melden
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    baseRow = data ?? null;
  }

  const base = extractBase(baseRow ?? {});

  // 2) Modellen uit catalog (dedupe)
  let models: Array<{ model: string; uses_category: boolean; has_custom: boolean; assigned_set: string | null }> = [];
  {
    const { data: modelRows, error: modelErr } = await sb
      .from('buyback_catalog')
      .select('model, category')
      .eq('category', category);

    if (!modelErr && Array.isArray(modelRows)) {
      const uniqModels = Array.from(
        new Set(
          modelRows
            .map((r: any) => String(r.model ?? '').trim())
            .filter(Boolean)
        )
      );
      models = uniqModels.map((m) => ({
        model: m,
        uses_category: true,
        has_custom: false,
        assigned_set: null,
      }));
    } else {
      // Geen modellen gevonden of query fout: stuur lege lijst i.p.v. 500
      models = [];
    }
  }

  return NextResponse.json(
    {
      base: {
        questions: base.questions,
        tips: base.tips,
        order: base.order,
        q_order: base.order,
        questions_order: base.order,
        updated_at: baseRow?.updated_at ?? null,
      },
      models,
    },
    { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } }
  );
}

export async function POST(req: Request) {
  const sb = sbClient();
  const body = await req.json().catch(() => ({}));
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

  const payload = {
    category,
    // Alles netjes genest in questions_JSON
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

  return NextResponse.json(
    { ok: true },
    { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } }
  );
}
