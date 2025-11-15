// app/api/admin/multipliers/category/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function sbAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

function safeParseJSON<T>(raw: any, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }
  return fallback;
}

type ModelRow = {
  model: string;
  uses_category: boolean;
  has_custom: boolean;
  assigned_set?: string | null;
};

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

type Questions = Record<
  string,
  {
    title?: string | null;
    options: QOption[];
  }
>;

type Body = {
  category: string;
  questions: Questions;
  order?: string[];
  q_order?: string[];
  questions_order?: string[];
  tips?: Record<string, string>;
};

/* ===================== GET: basis-set + modellen ===================== */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryRaw = (url.searchParams.get('category') || '').trim();
    if (!categoryRaw) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const supabase = sbAdmin();

    // 1) Categorie-basisset ophalen
    let { data: catRow, error: catErr } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('*')
      .eq('category', categoryRaw)
      .maybeSingle();

    if (!catRow && !catErr) {
      const { data: list, error: e2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('*')
        .ilike('category', categoryRaw)
        .limit(1);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      catRow = list?.[0] ?? null;
    }

    const rawQuestions =
      (catRow as any)?.questions_json ??
      (catRow as any)?.questions ??
      {};

    const parsed = safeParseJSON<any>(rawQuestions, {});

    // Ondersteun twee vormen:
    // A) { questions: { ... }, tips, question_order, ... }
    // B) { func: {...}, screen: {...}, ... } (directe keys)
    const baseQuestions =
      parsed?.questions && typeof parsed.questions === 'object'
        ? parsed.questions
        : (() => {
            const META = new Set(['questions', 'tips', 'voucher_help', 'question_order', 'order']);
            return Object.fromEntries(
              Object.entries(parsed).filter(([k]) => !META.has(k))
            );
          })();

    const rawOrder =
      parsed?.order ??
      parsed?.question_order ??
      null;

    const baseOrder: string[] =
      (Array.isArray(rawOrder) && rawOrder) ||
      Object.keys(baseQuestions);

    const baseTips =
      parsed?.tips ??
      {};

    // 2) Modellen voor deze categorie ophalen.
    let modelNames: string[] = [];

    {
      const { data: rows, error } = await supabase
        .from('buyback_catalog')
        .select('model, category')
        .ilike('category', categoryRaw);

      if (error && error.message?.toLowerCase().includes('relation')) {
        // Tabel bestaat niet; fallback hieronder
      } else if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      } else if (rows) {
        const seen = new Set<string>();
        for (const r of rows as any[]) {
          const m = String(r?.model ?? '').trim();
          if (!m) continue;
          if (seen.has(m.toLowerCase())) continue;
          seen.add(m.toLowerCase());
          modelNames.push(m);
        }
      }
    }

    // Fallback: buyback_model (indien aanwezig en gevuld)
    if (modelNames.length === 0) {
      const { data: rows, error } = await supabase
        .from('buyback_model')
        .select('model, category')
        .ilike('category', categoryRaw);
      if (!error && rows) {
        const seen = new Set<string>();
        for (const r of rows as any[]) {
          const m = String(r?.model ?? '').trim();
          if (!m) continue;
          if (seen.has(m.toLowerCase())) continue;
          seen.add(m.toLowerCase());
          modelNames.push(m);
        }
      }
    }

    // 3) Assignments ophalen en mappen per model
    const { data: asgRows, error: asgErr } = await supabase
      .from('buyback_model_multiplier_assignments')
      .select('model, category, assigned_set, uses_category, updated_at')
      .ilike('category', categoryRaw);

    if (asgErr) {
      return NextResponse.json({ error: asgErr.message }, { status: 500 });
    }

    const asgMap = new Map<string, { assigned_set: string | null; uses_category: boolean }>();
    for (const r of asgRows || []) {
      const m = String((r as any)?.model ?? '').trim();
      if (!m) continue;
      asgMap.set(m.toLowerCase(), {
        assigned_set: ((r as any)?.assigned_set ?? null) as string | null,
        uses_category: Boolean((r as any)?.uses_category ?? true),
      });
    }

    // 4) Modellen-output opbouwen met juiste status
    const models: ModelRow[] = modelNames
      .sort((a, b) => a.localeCompare(b))
      .map((m) => {
        const asg = asgMap.get(m.toLowerCase());
        const uses_category = asg ? !!asg.uses_category : true; // default: categorie gebruiken
        const assigned_set = asg ? (asg.assigned_set ?? null) : null;
        const has_custom = !!assigned_set;
        return { model: m, uses_category, has_custom, assigned_set };
      });

    // 5) Response voor AdminMultipliersClient
    const payload = {
      models,
      base: {
        questions: baseQuestions,
        tips: baseTips,
        order: baseOrder,
        q_order: baseOrder,
        questions_order: baseOrder,
        updated_at: (catRow as any)?.updated_at ?? null,
      },
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=600' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}

/* ===================== POST: basis categorie-set opslaan ===================== */

export async function POST(req: NextRequest) {
  try {
    const supabase = sbAdmin();
    const body = (await req.json()) as Body;

    const category = (body.category || '').trim();
    if (!category) {
      return NextResponse.json(
        { error: 'category is verplicht' },
        { status: 400 }
      );
    }

    const questions: Questions = body.questions || {};

    const order: string[] =
      (Array.isArray(body.order) && body.order) ||
      (Array.isArray(body.q_order) && body.q_order) ||
      (Array.isArray(body.questions_order) && body.questions_order) ||
      Object.keys(questions);

    const tips: Record<string, string> = body.tips || {};

    // Alles gaat in questions_json
    const questions_json = {
      questions,
      tips,
      question_order: order,
    };

    const { error } = await supabase
      .from('buyback_multipliers_per_category_json')
      .upsert(
        {
          category,
          questions_json,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'category',
        }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
