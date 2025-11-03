// app/api/admin/multipliers/model/save/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabaseAdminExport } from '@/lib/supabaseAdmin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sb() {
  const any: any = supabaseAdminExport as any;
  return typeof any === 'function' ? any() : any;
}

/**
 * Body: { model: string, questions: JSON, tips: JSON }
 * Slaat een custom per-model set op (maakt indien nodig).
 */
export async function POST(req: Request) {
  const s = sb();
  const body = await req.json().catch(() => ({}));
  const model = (body?.model || '').trim();
  const questions = body?.questions ?? {};
  const tips = body?.tips ?? {};

  if (!model) return NextResponse.json({ error: 'model required' }, { status: 400 });

  const { error } = await s
    .from('buyback_multipliers_per_model_json')
    .upsert({ model, questions_json: questions, tips_json: tips });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
