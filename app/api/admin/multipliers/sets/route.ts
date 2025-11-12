// app/api/admin/multipliers/sets/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';

function sbClient() {
  const anySb: any = supabaseAdminExport as any;
  return typeof anySb === 'function' ? anySb() : anySb;
}

type Questions = Record<
  string,
  {
    title?: string | null;
    options: Array<{
      key: string;
      label?: string | null;
      tip?: string | null;
      type: 'percent' | 'fixed';
      value: number;
      priority?: number | null;
      active?: boolean | null;
    }>;
  }
>;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category')?.trim();

    if (!category) {
      return NextResponse.json(
        { error: 'category query param is required' },
        { status: 400 }
      );
    }

    const sb = sbClient();

    // LET OP: check hier je eigen tabelnaam!
    // Veel projecten gebruiken: 'buyback_multiplier_sets_json'
    // Andere varianten die ik gezien heb: 'buyback_multipliers_sets_json'
    const { data, error } = await sb
      .from('buyback_multiplier_sets_json')
      .select('name, category, questions_json, order_json, q_order, questions_order')
      .eq('category', category);

    if (error) {
      // Als de tabel bestaat maar RLS / permissies spelen, zie je dat hier.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = Array.isArray(data) ? data : [];

    // Normaliseer naar shape die de client verwacht
    const sets = rows.map((r: any) => {
      const questions: Questions = (r?.questions_json as Questions) ?? {};
      const order: string[] =
        (Array.isArray(r?.order_json) && r.order_json) ||
        (Array.isArray(r?.q_order) && r.q_order) ||
        (Array.isArray(r?.questions_order) && r.questions_order) ||
        Object.keys(questions);

      return {
        name: String(r?.name ?? ''),
        questions,
        // De client accepteert 'order', 'q_order' of 'questions_order' en mapt dit
        // in AdminMultipliersClient -> we geven hier 'order' terug maar dat is geen must
        order,
        q_order: order,
        questions_order: order,
      };
    });

    // *** BELANGRIJK: sleutelnaam is 'sets' ***
    return NextResponse.json({ sets });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
