import { NextResponse } from 'next/server';
import { runShopifySync } from '@/lib/shopify/sync';
import { bearerMatches } from '@/lib/security/secrets';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Vercel Cron (5 minutes after the ERP sync) uses GET with CRON_SECRET as the bearer token.
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runShopifySync({ trigger: 'cron', actor: 'cron' });
    return NextResponse.json({ status: result.status, ...('reason' in result ? { reason: result.reason } : { runId: result.runId }) });
  } catch {
    console.error('[SHOPIFY SYNC] failed');
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }
}
