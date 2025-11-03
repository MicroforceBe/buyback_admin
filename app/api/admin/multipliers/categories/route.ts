// app/api/admin/multipliers/categories/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// anon key volstaat (RPC/VIEW kan SECURITY DEFINER gebruiken)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  // Haal alle categorieën op (enkel actieve rijen)
  const { data, error } = await supabase
    .from('buyback_catalog')
    .select('category')
    .eq('active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Normaliseer naar string[], trimmen + lege entries weg
  const raw: string[] = (data ?? [])
    .map((r: any) => (r?.category ?? ''))
    .map((s: string) => s.trim())
    .filter(Boolean) as string[];

  // ✔️ Dedupe + sort met expliciete generics om TS tevreden te houden
  const categories: string[] = Array.from(new Set<string>(raw)).sort((a, b) =>
    a.localeCompare(b)
  );

  return NextResponse.json({ categories });
}
