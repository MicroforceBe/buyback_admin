import { NextResponse } from 'next/server';
import { runRedirectBacklog } from '@/lib/shopify/redirectsRun';
import { bearerMatches } from '@/lib/security/secrets';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Vercel Cron (hourly, between the Shopify sync runs) uses GET with CRON_SECRET as the bearer token.
export async function GET(request: Request) {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const r = await runRedirectBacklog();
    return NextResponse.json(r.status === 'done'
      ? { status: 'done', dryRun: r.dryRun, created: r.created, replaced: r.replaced, existing: r.existing, failed: r.failed, remaining: r.remaining }
      : { status: r.status, reason: r.reason });
  } catch {
    console.error('[SHOPIFY REDIRECTS] failed');
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }
}
