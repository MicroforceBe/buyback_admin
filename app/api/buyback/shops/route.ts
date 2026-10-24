import { apiAccess } from '@/lib/security/access';
import { getCurrentAdminUser } from '@/lib/getCurrentAdminUser';
import { permits } from '@/lib/security/policy';
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
  const canManage = permits(await getCurrentAdminUser(), 'settings', 'read');
  let query = supabase
    .from('buyback_shops')
    .select('id, name, address1, zip, city, opening_hours, active, created_at, updated_at');
  if (!canManage) query = query.eq('active', true);
  const { data, error } = await query
    .order('name', { ascending: true });

  if (error) return j({ error: error.message }, 500);
  return j({ shops: data ?? [] }, 200);
}

export async function POST(req: Request) {
  const accessDenied = await apiAccess(req, 'settings', 'write', false);
  if (accessDenied) return accessDenied;

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

