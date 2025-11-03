// app/api/admin/multipliers/model/toggle/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sb() {
  const any: any = supabaseAdminExport as any;
  return typeof any === 'function' ? any() : any;
}

/**
 * Body:
 * { model: string, category: string, use_category: boolean }
 * - use_category = true  => verwijder custom per-model rij (valt terug op category-json)
 * - use_category = false => maak custom per-model aan, initieel gekopieerd van category-json
 */
export async function POST(req: Request) {
  const s = sb();
  const body = await req.json().catch(() => ({}));
  const model = (body?.model || '').trim();
  const category = (body?.category || '').trim();
  const useCategory = !!body?.use_category;

  if (!model || !category) {
    return NextResponse.json({ error: 'model & category required' }, { status: 400 });
  }

  if (useCategory) {
    // Verwijder custom override
    const { error } = await s
      .from('buyback_multipliers_per_model_json')
      .delete()
      .eq('model', model);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, removed_custom: true });
  } else {
    // Kopieer uit category naar per-model
    const { data: base, error: e1 } = await s
      .from('buyback_multipliers_per_category_json')
      .select('questions_json,tips_json')
      .eq('category', category)
      .maybeSingle();

    if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

    const questions = base?.questions_json ?? {};
    const tips = base?.tips_json ?? {};

    const { error: e2 } = await s
      .from('buyback_multipliers_per_model_json')
      .upsert({ model, questions_json: questions, tips_json: tips });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({ ok: true, created_custom: true });
  }
}
