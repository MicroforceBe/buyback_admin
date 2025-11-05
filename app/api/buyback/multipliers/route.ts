// app/api/buyback/multipliers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ---- Supabase admin client (service role) ----
function sbAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Verwacht query param: ?category=iPhone  (exact of case-insensitive)
 * Response shape:
 * {
 *   category: "iPhone",
 *   updated_at: "...",
 *   questions: { ... },
 *   question_order?: string[],
 *   tips?: { ... },
 *   voucher_help?: string | null
 * }
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryRaw = url.searchParams.get('category')?.trim();

    if (!categoryRaw) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const supabase = sbAdmin();

    // 1) Probeer exact match
    let { data, error } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('category, questions_json, updated_at')
      .eq('category', categoryRaw)
      .maybeSingle();

    // 2) Valt exact niets terug? Probeer case-insensitive (ilike) en pak eerste
    if (!data && !error) {
      const { data: list, error: error2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('category, questions_json, updated_at')
        .ilike('category', categoryRaw)
        .limit(1);

      if (error2) {
        return NextResponse.json({ error: error2.message }, { status: 500 });
      }
      data = list?.[0] ?? null;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not found', detail: `No category set for "${categoryRaw}"` },
        { status: 404 }
      );
    }

    const q = (data as any).questions_json ?? {};
    const payload = {
      category: data.category,
      updated_at: data.updated_at,
      questions: q.questions ?? {},
      // optioneel veld, alleen meesturen als het een array is
      ...(Array.isArray(q.question_order) ? { question_order: q.question_order } : {}),
      tips: q.tips ?? {},
      voucher_help: q.voucher_help ?? null,
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
