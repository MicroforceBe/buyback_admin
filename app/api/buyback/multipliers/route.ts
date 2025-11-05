import { NextResponse } from 'next/server';
import { supa } from '@/lib/supa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QOption = {
  key: string; label?: string | null; tip?: string | null;
  type: 'percent' | 'fixed'; value: number;
  priority?: number | null; active?: boolean;
};
type Questions = Record<string, { title?: string | null; options: QOption[] }>;

function extract(maybe: any) {
  const root = (maybe?.data && typeof maybe.data === 'object') ? maybe.data : maybe;
  return {
    questions: root?.questions as Questions | undefined,
    tips: root?.tips as Record<string, any> | undefined,
    question_order: root?.question_order as string[] | undefined,
    voucher_help: root?.voucher_help as string | undefined,
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = (url.searchParams.get('category') || '').trim();
    if (!category) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const { data, error } = await supa()
      .from('buyback_multipliers_per_category_json')
      .select('*')
      .eq('category', category)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    const payload = extract(data);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
