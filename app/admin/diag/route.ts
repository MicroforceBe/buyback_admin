import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const hasUrl = !!process.env.SUPABASE_URL;
  const hasSrv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    if (!hasUrl || !hasSrv) {
      return NextResponse.json({ ok: false, hasUrl, hasSrv, error: 'Missing server env' }, { status: 500 });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase
      .from('buyback_leads')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ ok: false, hasUrl, hasSrv, db: 'fail', error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, hasUrl, hasSrv, db: 'ok', last: data?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, hasUrl, hasSrv, caught: String(e) }, { status: 500 });
  }
}
