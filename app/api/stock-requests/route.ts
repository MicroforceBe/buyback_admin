import { NextResponse } from 'next/server';
import { runStockRequests } from '@/lib/stockRequests/run';
import { bearerMatches } from '@/lib/security/secrets';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Vercel Cron (elk uur op :20, na de Shopify-sync van :05) met CRON_SECRET als bearer-token: verwittigingen "Op aanvraag".
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ status: 'done', ...(await runStockRequests()) });
  } catch {
    console.error('[STOCK REQUESTS] failed');
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }
}
