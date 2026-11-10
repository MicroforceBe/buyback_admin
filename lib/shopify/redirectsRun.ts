import 'server-only';
// Hourly catch-up of 301s for draft and archived product pages (see redirectBacklog), with the Shopify sync's
// own switch: off = nothing, shadow = only count, live = write. Always starts at the first page: products
// that already have a good redirect cost one search per 50, so the backlog shrinks run after run.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig } from '@/lib/shopify/client';
import { redirectBacklog, type BacklogResult } from '@/lib/shopify/redirects';

export const CRON_MAX_REDIRECTS = 150;

export type RedirectRun = { status: 'skipped'; reason: string } | ({ status: 'done' } & BacklogResult);

export async function runRedirectBacklog(): Promise<RedirectRun> {
  const { data: settings, error } = await supabaseAdmin.from('shopify_sync_settings').select('mode').eq('id', true).maybeSingle();
  if (error || !settings) throw new Error('Shopify-instellingen konden niet worden geladen.');
  if (settings.mode === 'off') return { status: 'skipped', reason: 'Shopify-sync staat uit' };
  const cfg = shopifyConfig();
  if (!cfg) return { status: 'skipped', reason: 'Shopify niet geconfigureerd' };
  const r = await redirectBacklog(createShopifyClient(cfg), { max: CRON_MAX_REDIRECTS, pageLimit: 120, deadline: Date.now() + 240_000, dryRun: settings.mode !== 'live' });
  if (!r.scope) return { status: 'skipped', reason: 'recht write_online_store_navigation ontbreekt' };
  return { status: 'done', ...r };
}
