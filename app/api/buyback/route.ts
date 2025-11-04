// app/api/buyback/route.ts (ADMIN)
// Robuust voor twee schema-varianten van per-model multipliers:
//  - oude: titles (json), options (json/array), tips (json)
//  - nieuwe: questions_json (json), tips_json (json)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // anon volstaat met SECURITY DEFINER / policies
);

type QType = 'percent' | 'fixed';

type OptRow = {
  question_key: string;
  question_title?: string | null;
  option_key: string;
  option_label?: string | null;
  option_tip?: string | null;
  type: QType;
  value: number;
  priority?: number | null;
  active?: boolean | null;
};

type QuestionBlock = {
  title?: string | null;
  options: Array<{
    key: string;
    label?: string | null;
    tip?: string | null;
    type: QType;
    value: number;
    priority?: number | null;
    active?: boolean | null;
  }>;
};
type Questions = Record<string, QuestionBlock>;

function capKey(c: any) {
  const v = (c?.variant ?? '').trim();
  return `${v}|${c?.capacity_gb ?? ''}`;
}

function asJson<T=any>(x:any): T | null {
  if (!x) return null;
  if (typeof x === 'object') return x as T;
  if (typeof x === 'string') {
    try { return JSON.parse(x) as T; } catch {}
  }
  return null;
}

// Voeg optie toe als die nog NIET bestaat (overschrijft niks)
function upsertOption(target: Questions, r: OptRow) {
  const k = r.question_key;
  if (!k || !r.option_key) return;
  if (!target[k]) target[k] = { title: r.question_title ?? null, options: [] };
  else if (r.question_title && !target[k].title) target[k].title = r.question_title;

  if (target[k].options.some(o => o.key === r.option_key)) return;
  target[k].options.push({
    key: r.option_key,
    label: r.option_label ?? r.option_key,
    tip: r.option_tip ?? null,
    type: r.type,
    value: r.value,
    priority: r.priority ?? null,
    active: r.active ?? true,
  });
}

// Variant A: oude kolommen titles/options/tips
function mergePerModelLegacy(questions: Questions, tipsOut: Record<string,string>, row: any) {
  const titles = asJson<Record<string,string>>(row?.titles) ?? {};
  const optionsRaw = row?.options;
  const tips = asJson<Record<string,string>>(row?.tips) ?? {};

  for (const [k,v] of Object.entries(tips)) if (typeof v === 'string') tipsOut[k]=v;

  for (const [qk, title] of Object.entries(titles)) {
    if (!questions[qk]) questions[qk] = { title: title ?? null, options: [] };
    else if (title && !questions[qk].title) questions[qk].title = title;
  }

  // object-vorm: { question_key: [ {key,label,...}, ... ] }
  const obj = asJson<Record<string, any[]>>(optionsRaw);
  if (obj && !Array.isArray(obj)) {
    for (const [qk, arr] of Object.entries(obj)) {
      const list = Array.isArray(arr) ? arr : [];
      if (!questions[qk]) questions[qk] = { title: titles[qk] ?? null, options: [] };
      for (const o of list) {
        upsertOption(questions, {
          question_key: qk,
          question_title: titles[qk] ?? null,
          option_key: String(o?.key ?? ''),
          option_label: o?.label ?? o?.key ?? null,
          option_tip: o?.tip ?? null,
          type: (o?.type === 'fixed' ? 'fixed' : 'percent'),
          value: Number(o?.value ?? 1),
          priority: (o?.priority ?? null),
          active: (o?.active ?? true),
        });
      }
    }
    return;
  }

  // array-vorm: [{question_key, option_key, ...}]
  const arr = asJson<any[]>(optionsRaw) ?? (Array.isArray(optionsRaw) ? optionsRaw : null);
  if (Array.isArray(arr)) {
    for (const o of arr) {
      const qk = String(o?.question_key ?? '');
      if (!qk) continue;
      upsertOption(questions, {
        question_key: qk,
        question_title: titles[qk] ?? null,
        option_key: String(o?.option_key ?? o?.key ?? ''),
        option_label: o?.option_label ?? o?.label ?? o?.option_key ?? o?.key ?? null,
        option_tip: o?.option_tip ?? o?.tip ?? null,
        type: (o?.type === 'fixed' ? 'fixed' : 'percent'),
        value: Number(o?.value ?? 1),
        priority: (o?.priority ?? null),
        active: (o?.active ?? true),
      });
    }
  }
}

// Variant B: nieuwe kolommen questions_json/tips_json
function mergePerModelJson(questions: Questions, tipsOut: Record<string,string>, row: any) {
  const q = asJson<Questions>(row?.questions_json) ?? {};
  const t = asJson<Record<string,string>>(row?.tips_json) ?? {};
  Object.assign(tipsOut, t);
  for (const [qk, block] of Object.entries(q)) {
    if (!questions[qk]) questions[qk] = { title: block?.title ?? null, options: [] };
    if (block?.title && !questions[qk].title) questions[qk].title = block.title;
    for (const o of (block?.options ?? [])) {
      upsertOption(questions, {
        question_key: qk,
        question_title: block?.title ?? null,
        option_key: String(o?.key ?? ''),
        option_label: o?.label ?? null,
        option_tip: o?.tip ?? null,
        type: (o?.type === 'fixed' ? 'fixed' : 'percent'),
        value: Number(o?.value ?? 1),
        priority: (o?.priority ?? null),
        active: (o?.active ?? true),
      });
    }
  }
}

function sortByPriority(q: Questions) {
  for (const k of Object.keys(q)) {
    q[k].options = [...(q[k].options ?? [])].sort(
      (a,b) => (a.priority ?? 999) - (b.priority ?? 999)
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const model = (searchParams.get('model') || '').trim();

    // Zonder ?model => lijst van modellen
    if (!model) {
      const { data, error } = await supabase
        .from('buyback_catalog')
        .select('model')
        .eq('active', true)
        .order('model', { ascending: true });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const models = Array.from(new Set((data ?? []).map((r:any)=>r.model))).filter(Boolean);
      return NextResponse.json({ models, data: null }, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=86400' }});
    }

    // Detail + capaciteiten
    const { data, error } = await supabase
      .from('buyback_catalog')
      .select('brand,category,submodel,model,variant,capacity_gb,base_price_cents,image_url,active')
      .eq('model', model)
      .eq('active', true)
      .order('variant', { ascending: true })
      .order('capacity_gb', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) return NextResponse.json({ data: null }, { status: 200 });

    const modelImage: string | null =
      (data.find((r:any)=>!!r.image_url)?.image_url as string | undefined) ?? null;

    const seen = new Set<string>();
    const capacities: Array<{capacity_gb: number; price_cents: number; image_url?: string|null; variant?: string|null;}> = [];
    for (const r of data as any[]) {
      const key = capKey({ variant: r.variant, capacity_gb: r.capacity_gb });
      if (seen.has(key)) continue;
      seen.add(key);
      capacities.push({
        capacity_gb: r.capacity_gb,
        price_cents: r.base_price_cents,
        image_url: r.image_url ?? modelImage ?? null,
        variant: r.variant ?? null,
      });
    }

    // ===== Multipliers opbouwen =====
    let questions: Questions = {};
    let tips: Record<string,string> = {};

    // 1) Per-model JSON, maar selecteer * zodat er geen “column does not exist” ontstaat
    {
      const { data: row } = await supabase
        .from('buyback_multipliers_per_model_json')
        .select('*')
        .eq('model', model)
        .maybeSingle();

      if (row) {
        if (row.questions_json || row.tips_json) {
          // nieuwe schema
          mergePerModelJson(questions, tips, row);
        } else {
          // oude schema
          mergePerModelLegacy(questions, tips, row);
        }
      }
    }

    // 2) Landing aanvullen
    {
      const { data: landing } = await supabase
        .from('buyback_multipliers_landing')
        .select('question_key,question_title,option_key,option_label,option_tip,type,value,priority,active')
        .eq('active', true);

      for (const r of (landing as OptRow[] | null) ?? []) {
        if (!r?.question_key || !r.option_key || !r.type) continue;
        upsertOption(questions, r);
      }
    }

    // 3) Norm aanvullen
    {
      const { data: norm } = await supabase
        .from('buyback_multipliers_norm')
        .select('question_key,question_title,option_key,option_label,option_tip,type,value,priority,active')
        .eq('active', true);

      for (const r of (norm as OptRow[] | null) ?? []) {
        if (!r?.question_key || !r.option_key || !r.type) continue;
        upsertOption(questions, r);
      }
    }

    sortByPriority(questions);

    const payload = {
      model,
      brand: (data[0] as any).brand ?? null,
      category: (data[0] as any).category ?? null,
      submodel: (data[0] as any).submodel ?? null,
      image_url: modelImage,
      capacities,
      questions,
      tips,
    };

    return NextResponse.json({ data: payload }, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=86400' },
    });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
