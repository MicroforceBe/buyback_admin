// app/api/admin/multipliers/sets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function parse(maybe: any) {
  if (!maybe) return {};
  if (typeof maybe === 'string') { try { return JSON.parse(maybe); } catch { return {}; } }
  return maybe;
}

export async function GET(req: NextRequest) {
  const sb = typeof (supabaseAdmin as any) === 'function' ? (supabaseAdmin as any)() : supabaseAdmin;
  const category = String(req.nextUrl.searchParams.get('category') || '').trim();

  const { data, error } = await sb
    .from('buyback_multiplier_sets_json')
    .select('name, questions_json, order')
    .eq('category', category)
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sets = (data || []).map((r: any) => {
    const container = parse(r.questions_json);
    const questions = container?.questions && typeof container.questions === 'object'
      ? container.questions
      : (() => {
          const { tips, order, q_order, questions_order, updated_at, ...rest } = container || {};
          return rest || {};
        })();
    const order =
      (Array.isArray(container?.order) && container.order) ||
      (Array.isArray(container?.q_order) && container.q_order) ||
      (Array.isArray(container?.questions_order) && container.questions_order) ||
      (Array.isArray(r?.order) && r.order) ||
      Object.keys(questions);
    return { name: r.name, questions, order };
  });

  return NextResponse.json({ sets });
}
