import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function safeParseJson(maybe: any) {
  if (!maybe) return {};
  if (typeof maybe === 'string') { try { return JSON.parse(maybe); } catch { return {}; } }
  return maybe;
}
function extractBase(row: any) {
  const raw = row?.questions_json ?? row?.questions_JSON ?? {};
  const container = safeParseJson(raw);

  // Jouw vorm: alles vlak + optioneel tips/order
  let questions: any = {};
  if (container && typeof container === 'object') {
    if (container.questions && typeof container.questions === 'object') {
      questions = container.questions;
    } else {
      const { tips, order, q_order, questions_order, updated_at, ...rest } = container;
      questions = rest && Object.keys(rest).length ? rest : {};
    }
  }

  const tips = container?.tips ?? {};
  const order =
    (Array.isArray(container?.order) && container.order) ||
    (Array.isArray(container?.q_order) && container.q_order) ||
    (Array.isArray(container?.questions_order) && container.questions_order) ||
    Object.keys(questions);

  return { questions, tips, order };
}

export async function GET(req: NextRequest) {
  const sb = typeof (supabaseAdmin as any) === 'function' ? (supabaseAdmin as any)() : supabaseAdmin;
  const category = String(req.nextUrl.searchParams.get('category') || '').trim();

  const { data: baseRow, error: baseErr } = await sb
    .from('buyback_multipliers_per_category_json')
    .select('category, questions_json, questions_JSON, updated_at, tips, order')
    .eq('category', category)
    .maybeSingle();

  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 500 });

  const base = baseRow ? extractBase(baseRow) : { questions: {}, tips: {}, order: [] };

  const { data: modelsRows, error: modelsErr } = await sb
    .from('buyback_catalog')
    .select('model, category')
    .eq('category', category);

  if (modelsErr) return NextResponse.json({ error: modelsErr.message }, { status: 500 });

  const { data: assignedRows } = await sb
    .from('buyback_model_assigned_set')
    .select('model, set_name, category')
    .eq('category', category);

  const assignedMap = new Map<string, string | null>();
  (assignedRows || []).forEach((r: any) => assignedMap.set(String(r.model), r.set_name || null));

  const { data: customRows } = await sb
    .from('buyback_model_custom_json')
    .select('model');

  const customSet = new Set((customRows || []).map((r: any) => String(r.model)));

  const seen = new Set<string>();
  const models = (modelsRows || [])
    .map((r: any) => String(r.model))
    .filter((m) => {
      const k = m.trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return !!k;
    })
    .map((model) => {
      const assigned = assignedMap.get(model) ?? null;
      const has_custom = customSet.has(model) || !!assigned;
      const uses_category = !has_custom || !assigned;
      return { model, uses_category, has_custom, assigned_set: assigned } as any;
    });

  return NextResponse.json({
    base: {
      questions: base.questions,
      tips: base.tips,
      order: base.order,
      questions_order: base.order,
      q_order: base.order,
    },
    models,
  });
}

export async function POST(req: NextRequest) {
  const sb = typeof (supabaseAdmin as any) === 'function' ? (supabaseAdmin as any)() : supabaseAdmin;
  const body = await req.json();

  const category = String(body?.category || '').trim();
  const questions = body?.questions || {};
  const tips = body?.tips || {};
  const order = body?.order || body?.q_order || body?.questions_order || Object.keys(questions);

  const payload = {
    category,
    questions_json: { ...questions, tips, order },
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from('buyback_multipliers_per_category_json')
    .upsert(payload, { onConflict: 'category' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
