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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryRaw = (url.searchParams.get('category') || '').trim();
    if (!categoryRaw) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const supabase = sbAdmin();

    // 1) Categorie-basisset ophalen (voor beheer-paneel linksboven)
    //    Vorm: buyback_multipliers_per_category_json(category, questions_json, updated_at)
    let { data: catRow, error: catErr } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('category, questions_json, updated_at, tips, question_order, voucher_help')
      .eq('category', categoryRaw)
      .maybeSingle();

    if (!catRow && !catErr) {
      const { data: list, error: e2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('category, questions_json, updated_at, tips, question_order, voucher_help')
        .ilike('category', categoryRaw)
        .limit(1);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      catRow = list?.[0] ?? null;
    }

    const parsed = safeParseJSON<any>(catRow?.questions_json ?? {}, {});
    const baseQuestions =
      parsed?.questions && typeof parsed.questions === 'object'
        ? parsed.questions
        : (() => {
            // Vorm B: alle keys behalve meta
            const META = new Set(['questions', 'tips', 'voucher_help', 'question_order']);
            return Object.fromEntries(
              Object.entries(parsed).filter(([k]) => !META.has(k))
            );
          })();

    const baseOrder: string[] =
      (Array.isArray(catRow?.question_order) && catRow?.question_order) ||
      (Array.isArray(parsed?.question_order) && parsed?.question_order) ||
      Object.keys(baseQuestions);

    const baseTips = (catRow as any)?.tips ?? parsed?.tips ?? {};

    // 2) Modellen voor deze categorie ophalen.
    //    Bronnen kunnen verschillen per project; we proberen eerst buyback_catalog (distinct model).
    //    Val terug op andere tabellen indien nodig.
    let modelNames: string[] = [];

    {
      const { data: rows, error } = await supabase
        .from('buyback_catalog')
        .select('model, category')
        .ilike('category', categoryRaw);

      if (error && error.message?.toLowerCase().includes('relation')) {
        // Tabel bestaat niet; laat val-back hieronder zijn werk doen
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
        updated_at: catRow?.updated_at ?? null,
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
