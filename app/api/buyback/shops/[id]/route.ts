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

export async function PATCH(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await _.json().catch(() => ({}));
  // Alleen velden die we toestaan
  const up: any = {};
  if ('name' in body) up.name = String(body.name ?? '').trim();
  if ('address1' in body) up.address1 = body.address1 ?? '';
  if ('zip' in body) up.zip = body.zip ?? '';
  if ('city' in body) up.city = body.city ?? '';
  if ('opening_hours' in body) up.opening_hours = body.opening_hours ?? {};
  if ('active' in body) up.active = !!body.active;

  if (Object.keys(up).length === 0) return j({ error: 'No fields to update' }, 400);

  const { data, error } = await supabase
    .from('buyback_shops')
    .update(up)
    .eq('id', id)
    .select('id')
    .single();

  if (error) return j({ error: error.message }, 500);
  return j({ ok: true, id: data?.id }, 200);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const { error } = await supabase.from('buyback_shops').delete().eq('id', id);
  if (error) return j({ error: error.message }, 500);
  return j({ ok: true }, 200);
}
