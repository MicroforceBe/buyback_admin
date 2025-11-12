// app/api/buyback/multipliers/route.ts
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

/** Safe JSON parse – accepteert objecten of JSON strings, anders fallback */
function safeParseJSON<T = any>(v: any, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'object') return v as T;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }
  return fallback;
}

/** Haal order uit diverse veldnamen (enkel arrays tellen) */
function firstOrderLike(obj: any, fallback: string[] = []): string[] {
  if (Array.isArray(obj?.order) && obj.order.length) return obj.order;
  if (Array.isArray(obj?.q_order) && obj.q_order.length) return obj.q_order;
  if (Array.isArray(obj?.questions_order) && obj.questions_order.length) return obj.questions_order;
  if (Array.isArray(obj?.question_order) && obj.question_order.length) return obj.question_order;
  return fallback;
}

/** Extracteer vragen + meta (werkt voor {questions:{...}} of vlakke vorm) */
function extractQuestionsAndMeta(raw: any): {
  questions: Record<string, any>;
  tips?: Record<string, string>;
  order?: string[];
  voucher_help?: string | null;
} {
  const KNOWN_META = new Set(['questions', 'tips', 'voucher_help', 'question_order', 'order', 'q_order', 'questions_order']);
  const qJson = raw && typeof raw === 'object' ? raw : {};
  const questions =
    (qJson.questions && typeof qJson.questions === 'object')
      ? (qJson.questions as Record<string, any>)
      : Object.fromEntries(Object.entries(qJson).filter(([k]) => !KNOWN_META.has(k)));

  const tips = (qJson.tips && typeof qJson.tips === 'object') ? (qJson.tips as Record<string, string>) : undefined;
  const voucher_help = (typeof qJson.voucher_help === 'string') ? qJson.voucher_help : null;
  const order = firstOrderLike(qJson, Object.keys(questions));

  return { questions, tips, order, voucher_help };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryRaw = url.searchParams.get('category')?.trim();
    const modelRaw = url.searchParams.get('model')?.trim(); // optioneel: model voor custom/fallbacks

    if (!categoryRaw) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const supabase = sbAdmin();

    // 1) Categorie ophalen
    let { data: catRow, error: catErr } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('category, questions_json, updated_at')
      .eq('category', categoryRaw)
      .maybeSingle();

    if (!catRow && !catErr) {
      const { data: list, error: e2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('category, questions_json, updated_at')
        .ilike('category', categoryRaw)
        .limit(1);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      catRow = list?.[0] ?? null;
    }

    if (!catRow) {
      return NextResponse.json(
        { error: 'not found', detail: `No category set for "${categoryRaw}"` },
        { status: 404 }
      );
    }

    // Normaliseer categorie JSON
    const catJSON = safeParseJSON<any>((catRow as any).questions_json, {});
    const catMeta = extractQuestionsAndMeta(catJSON);

    // Defaults uit categorie
    let outQuestions = catMeta.questions;
    let outOrder = catMeta.order ?? Object.keys(outQuestions);
    let outTips: Record<string, string> | undefined = catMeta.tips ?? {};
    let voucher_help: string | null | undefined = catMeta.voucher_help ?? null;

    // 2) MODEL-specifiek?
    if (modelRaw) {
      const { data: mRow, error: mErr } = await supabase
        .from('buyback_multipliers_models')
        .select('model, category, uses_category, assigned_set, custom_questions, custom_order, custom_tips')
        .eq('model', modelRaw)
        .maybeSingle();

      if (!mErr && mRow) {
        // 2a) Ad-hoc custom
        const customQ = safeParseJSON<Record<string, any>>(mRow.custom_questions, {}); // <-- geen null meer
        if (Object.keys(customQ).length) {
          outQuestions = customQ;
          const parsedCustomOrder = safeParseJSON<string[]>(mRow.custom_order, []);
          outOrder = parsedCustomOrder.length ? parsedCustomOrder : Object.keys(customQ);
          const parsedCustomTips = safeParseJSON<Record<string, string>>(mRow.custom_tips, {});
          if (Object.keys(parsedCustomTips).length) outTips = parsedCustomTips;
        }
        // 2b) Toegewezen set
        else if (mRow.assigned_set) {
          const { data: setRow, error: setErr } = await supabase
            .from('buyback_multipliers_sets')
            .select('category, name, questions, "order", updated_at')
            .eq('category', (catRow as any).category)
            .eq('name', mRow.assigned_set)
            .maybeSingle();

          if (!setErr && setRow) {
            const setQuestions = safeParseJSON<Record<string, any>>((setRow as any).questions, {});
            const parsedSetOrder = safeParseJSON<string[]>((setRow as any).order, []);
            outQuestions = setQuestions;
            outOrder = parsedSetOrder.length
              ? parsedSetOrder
              : firstOrderLike(setRow, Object.keys(setQuestions));
            // tips: sets hebben geen tips-kolom → laat categorie-tips staan
          }
        }
        // 2c) uses_category → blijft categorie-default
      }
    }

    const payload = {
      category: (catRow as any).category,
      updated_at: (catRow as any).updated_at,
      model: modelRaw || null,
      questions: outQuestions,
      question_order: outOrder,
      tips: outTips ?? {},
      voucher_help: voucher_help ?? null,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=3600' },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
