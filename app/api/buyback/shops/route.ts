import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function j(data:any, status=200){ return NextResponse.json(data, { status }); }

export async function GET() {
  const { data, error } = await supabase
    .from('buyback_shops')
    .select('id, name, address1, zip, city, opening_hours, active, created_at, updated_at')
    .order('name', { ascending: true });

  if (error) return j({ error: error.message }, 500);
  return j({ shops: data ?? [] }, 200);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    name,
    address1 = '',
    zip = '',
    city = '',
    opening_hours = {},
    active = true,
  } = body || {};

  if (!name?.trim()) return j({ error: 'Name is required' }, 400);

  const { data, error } = await supabase
    .from('buyback_shops')
    .insert([{ name: String(name).trim(), address1, zip, city, opening_hours, active }])
    .select('id')
    .single();

  if (error) return j({ error: error.message }, 500);
  return j({ ok: true, id: data?.id }, 201);
}
