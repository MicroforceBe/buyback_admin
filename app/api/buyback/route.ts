import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // anon is genoeg dankzij SECURITY DEFINER
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model'); // optioneel

  const { data, error } = await supabase.rpc('api_buyback_widget', { p_model: model });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cache voor 5 min op de edge, met lange stale (CDN-friendly)
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 's-maxage=300, stale-while-revalidate=86400'
    }
  });
}
