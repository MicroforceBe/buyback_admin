// app/api/admin/multipliers/sets/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

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

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category')?.trim();
    if (!category) {
      return NextResponse.json({ error: 'category query param is required' }, { status: 400 });
    }

    const sb = sbClient();

    // ✅ Exact jouw kolomnamen:
    // id, category, name, questions (jsonb), order (jsonb/array), created_at, updated_at
    const { data, error } = await sb
      .from('buyback_multiplier_sets_json')
      .select('name, category, questions, order')
      .eq('category', category);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];

    const sets = rows.map((r: any) => {
      const questions: Questions = (r?.questions as Questions) ?? {};
      const order: string[] =
        (Array.isArray(r?.order) && r.order) || Object.keys(questions);

      // De client leest sj.sets en mapt zelf qOrder uit order/q_order/questions_order
      return {
        name: String(r?.name ?? ''),
        questions,
        order,             // ← meegeven voor backward/forward compat
        q_order: order,    // ← ook populeren, zodat de UI altijd een volgorde vindt
        questions_order: order,
      };
    });

    return NextResponse.json({ sets });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
