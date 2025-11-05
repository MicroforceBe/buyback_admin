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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const categoryRaw = url.searchParams.get('category')?.trim();
    if (!categoryRaw) {
      return NextResponse.json({ error: 'missing category' }, { status: 400 });
    }

    const supabase = sbAdmin();

    // exact match
    let { data, error } = await supabase
      .from('buyback_multipliers_per_category_json')
      .select('category, questions_json, updated_at')
      .eq('category', categoryRaw)
      .maybeSingle();

    // case-insensitive fallback
    if (!data && !error) {
      const { data: list, error: e2 } = await supabase
        .from('buyback_multipliers_per_category_json')
        .select('category, questions_json, updated_at')
        .ilike('category', categoryRaw)
        .limit(1);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
      data = list?.[0] ?? null;
    }

    if (!data) {
      return NextResponse.json(
        { error: 'not found', detail: `No category set for "${categoryRaw}"` },
        { status: 404 }
      );
    }

    // ---- Normaliseren van questions_json ----
    let q: any = (data as any).questions_json ?? {};

    // 1) Als Supabase het als TEXT teruggeeft, parse
    if (typeof q === 'string') {
      try { q = JSON.parse(q); } catch { q = {}; }
    }

    // 2) Ondersteun beide vormen:
    //    Vorm A: { questions: {...}, tips, voucher_help, question_order }
    //    Vorm B: { <vragen...>, tips?, voucher_help?, question_order? }
    const KNOWN_META = new Set(['questions', 'tips', 'voucher_help', 'question_order']);

    let questions: Record<string, any> = {};
    if (q && typeof q === 'object') {
      if (q.questions && typeof q.questions === 'object') {
        questions = q.questions;
      } else {
        // Vorm B: alles behalve meta-keys is een vraagblok
        questions = Object.fromEntries(
          Object.entries(q).filter(([k]) => !KNOWN_META.has(k))
        );
      }
    }

    const payload = {
      category: data.category,
      updated_at: data.updated_at,
      questions,
      ...(Array.isArray(q?.question_order) ? { question_order: q.question_order } : {}),
      tips: q?.tips ?? {},
      voucher_help: q?.voucher_help ?? null,
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
