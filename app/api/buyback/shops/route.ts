import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function j(data:any, status=200){ return NextResponse.json(data,{status}); }

export async function GET() {
  const { data, error } = await supabase
    .from('buyback_shops')
    .select('id, name, address1, zip, city, opening_hours')
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) return j({ error: error.message }, 500);
  return j({ shops: data ?? [] }, 200);
}
