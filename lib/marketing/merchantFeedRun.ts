import 'server-only';
// One run of the own Google Merchant feed: Shopify products -> offers -> only what changed goes to the
// Merchant API, offers that are no longer wanted are removed. Modes: off (nothing), test (only the listed
// products, as test offers no Google surface shows), live (the whole feed). Runs after the Shopify sync.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig, type ShopifyClient } from '@/lib/shopify/client';
import { deleteProductInput, googleSettings, insertProductInput } from '@/lib/marketing/google';
import type { ServiceAccount } from '@/lib/marketing/googleData';
import { CONTENT_LANGUAGE, FEED_LABEL, FEED_PRODUCTS, FEED_PRODUCTS_BY_ID, planFeed, productOffers, type FeedOffer, type FeedProduct, type SentRow, type Skip } from '@/lib/marketing/merchantFeed';

export type FeedMode = 'off' | 'test' | 'live';
export type FeedResult =
  | { status: 'skipped'; reason: 'off' | 'running' | 'not_configured' }
  | { status: 'succeeded' | 'failed' | 'stopped'; runId: string; mode: Exclude<FeedMode, 'off'>; counts: Record<string, unknown>; error?: string };

const STALE_RUN_MINUTES = 20;
const KEEP_RUNS_DAYS = 30;
/** Writes per run; the rest follows in the next run (a run must finish well within the function limit). */
export const MAX_WRITES_PER_RUN = 400;
const CONCURRENCY = 5;

type Google = { sa: ServiceAccount; account: string; dataSource: string };
type Deps = {
  db?: SupabaseClient;
  client?: ShopifyClient | null;
  google?: Google | null;
  insert?: (g: Google, input: unknown) => Promise<void>;
  remove?: (g: Google, productInput: string) => Promise<void>;
};

async function loadProducts(client: ShopifyClient, mode: 'test' | 'live', testProducts: string[]): Promise<FeedProduct[]> {
  if (mode === 'test') {
    if (!testProducts.length) return [];
    const { nodes } = await client.graphql<{ nodes: (FeedProduct | null)[] }>(FEED_PRODUCTS_BY_ID, { ids: testProducts });
    return nodes.filter((n): n is FeedProduct => !!n && !!n.id);
  }
  const all: FeedProduct[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedProduct[] } } = await client.graphql(FEED_PRODUCTS, { after });
    all.push(...page.products.nodes);
    if (!page.products.pageInfo.hasNextPage || !page.products.pageInfo.endCursor || page.products.pageInfo.endCursor === after) break;
    after = page.products.pageInfo.endCursor;
  }
  return all;
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'onbekende fout').slice(0, 300);

/** Runs the feed once. Safe from cron and the admin page: a second concurrent run is refused by the database. */
export async function runMerchantFeed(input: { trigger: 'cron' | 'manual'; actor: string }, deps: Deps = {}): Promise<FeedResult> {
  const db = deps.db ?? supabaseAdmin;
  const { data: settings, error: settingsError } = await db.from('merchant_feed_settings').select('mode,data_source,test_products,max_changes').eq('id', true).maybeSingle();
  if (settingsError || !settings) throw new Error('Feed-instellingen konden niet worden geladen.');
  const mode = settings.mode as FeedMode;
  if (mode === 'off') return { status: 'skipped', reason: 'off' };

  const client = deps.client !== undefined ? deps.client : (() => { const cfg = shopifyConfig(); return cfg ? createShopifyClient(cfg) : null; })();
  const google = deps.google !== undefined ? deps.google : (() => {
    const { sa, merchant } = googleSettings();
    return sa && merchant && settings.data_source ? { sa, account: merchant, dataSource: settings.data_source as string } : null;
  })();
  if (!client || !google) return { status: 'skipped', reason: 'not_configured' };
  const insert = deps.insert ?? ((g: Google, body: unknown) => insertProductInput(g.sa, g.account, g.dataSource, body));
  const remove = deps.remove ?? ((g: Google, name: string) => deleteProductInput(g.sa, g.account, g.dataSource, name));

  await db.from('merchant_feed_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Afgebroken: de run duurde te lang of de server stopte.' })
    .eq('status', 'running').lt('started_at', new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString());
  const { data: run, error: runError } = await db.from('merchant_feed_runs').insert({ trigger: input.trigger, mode, started_by: input.actor }).select('id').single();
  if (runError?.code === '23505') return { status: 'skipped', reason: 'running' };
  if (runError || !run) throw new Error('De feed kon niet starten.');
  const runId = run.id as string;

  const counts: Record<string, unknown> = {};
  const finish = async (status: 'succeeded' | 'failed' | 'stopped', error?: string): Promise<FeedResult> => {
    await db.from('merchant_feed_runs').update({ status, counts, error: error ?? null, finished_at: new Date().toISOString() }).eq('id', runId);
    await db.from('merchant_feed_runs').delete().lt('started_at', new Date(Date.now() - KEEP_RUNS_DAYS * 86_400_000).toISOString());
    return { status, runId, mode, counts, ...(error ? { error } : {}) };
  };

  try {
    const test = mode === 'test';
    const products = await loadProducts(client, mode, (settings.test_products as string[]) ?? []);
    const offers: FeedOffer[] = [];
    const skipped: Skip[] = [];
    for (const p of products) {
      const r = productOffers(p, { test });
      offers.push(...r.offers);
      if (r.skip) skipped.push(r.skip);
    }
    const { data: sentRows, error: sentError } = await db.from('merchant_feed_items').select('offer_id,hash,test');
    if (sentError) throw new Error('Verzonden producten konden niet worden geladen.');
    const plan = planFeed(offers, (sentRows ?? []) as SentRow[], { test });
    Object.assign(counts, {
      products: products.length, offers: offers.length, unchanged: plan.unchanged, toSend: plan.upserts.length, toRemove: plan.deletes.length,
      skipped: skipped.length, skippedReasons: Object.fromEntries([...skipped.reduce((m, s) => m.set(s.reason, (m.get(s.reason) ?? 0) + 1), new Map<string, number>())]),
      ...(test ? { skippedList: skipped.slice(0, 20) } : {}),
    });

    if (plan.upserts.length + plan.deletes.length > settings.max_changes) {
      return await finish('stopped', `Noodrem: ${plan.upserts.length} producten versturen en ${plan.deletes.length} verwijderen is meer dan het ingestelde maximum (${settings.max_changes}). Er is niets naar Google gestuurd.`);
    }

    // Deletes first (they free offers), then inserts; at most MAX_WRITES_PER_RUN writes, the rest next run.
    const deletes = plan.deletes.slice(0, MAX_WRITES_PER_RUN);
    const upserts = plan.upserts.slice(0, Math.max(0, MAX_WRITES_PER_RUN - deletes.length));
    const failed: { offerId: string; reason: string }[] = [];
    let sent = 0, removed = 0;
    await inBatches(deletes, async offerId => {
      try {
        await remove(google, `${CONTENT_LANGUAGE}~${FEED_LABEL}~${offerId}`);
        const { error } = await db.from('merchant_feed_items').delete().eq('offer_id', offerId);
        if (error) throw new Error('logboek niet bijgewerkt');
        removed++;
      } catch (e) { failed.push({ offerId, reason: errorText(e) }); }
    });
    await inBatches(upserts, async o => {
      try {
        await insert(google, o.input);
        const { error } = await db.from('merchant_feed_items').upsert({ offer_id: o.input.offerId, product_id: o.productId, hash: o.hash, test, sent_at: new Date().toISOString() });
        if (error) throw new Error('logboek niet bijgewerkt');
        sent++;
      } catch (e) { failed.push({ offerId: o.input.offerId, reason: errorText(e) }); }
    });
    Object.assign(counts, { sent, removed, failed: failed.length, remaining: plan.upserts.length - upserts.length + plan.deletes.length - deletes.length, ...(failed.length ? { errors: failed.slice(0, 20) } : {}) });
    return await finish(failed.length ? 'failed' : 'succeeded', failed.length ? `${failed.length} product(en) konden niet naar Google; zie de details.` : undefined);
  } catch (e) {
    return await finish('failed', errorText(e));
  }
}
