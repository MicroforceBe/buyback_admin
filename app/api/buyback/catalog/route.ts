import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 's-maxage=300, stale-while-revalidate=86400',
};

export function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET() {
  const { data, error } = await supabase.rpc('api_buyback_catalog');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }
  return NextResponse.json(data, { headers: CORS });
}
