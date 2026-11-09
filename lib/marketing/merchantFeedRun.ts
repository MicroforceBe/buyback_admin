import 'server-only';
// One run of the own Google Merchant feed: Shopify products -> offers -> only what changed goes to the
// Merchant API, offers that are no longer wanted are removed. Modes: off (nothing), test (only the listed
// products, as test offers no Google surface shows), live (the whole feed). Runs after the Shopify sync.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig, type ShopifyClient } from '@/lib/shopify/client';
import { deleteLocalInventory, deleteProductInput, googleSettings, insertLocalInventory, insertProductInput } from '@/lib/marketing/google';
import type { ServiceAccount } from '@/lib/marketing/googleData';
import { CONTENT_LANGUAGE, FEED_LABEL, FEED_MORE_LEVELS, FEED_MORE_VARIANTS, FEED_PRODUCTS, FEED_PRODUCTS_BY_ID, gtinsByModel, PICKUP_LOCATIONS, pickupLocations, planFeed, productOffers, type FeedLevel, type FeedOffer, type FeedProduct, type FeedVariant, type LocalInventory, type LocalUpdate, type SentRow, type Skip, type StoreCodes } from '@/lib/marketing/merchantFeed';

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
  insertLocal?: (g: Google, productInput: string, inventory: LocalInventory) => Promise<void>;
  removeLocal?: (g: Google, productInput: string, storeCode: string) => Promise<void>;
};

/** Completes the variant list of a product with more than one page of variants. */
async function allVariants(client: ShopifyClient, p: FeedProduct): Promise<FeedProduct> {
  let info = p.variants.pageInfo;
  const nodes = [...p.variants.nodes];
  while (info?.hasNextPage && info.endCursor) {
    const after: string = info.endCursor;
    const page: { product: { variants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedProduct['variants']['nodes'] } } | null } = await client.graphql(FEED_MORE_VARIANTS, { id: p.id, after });
    if (!page.product) break;
    nodes.push(...page.product.variants.nodes);
    info = page.product.variants.pageInfo.endCursor === after ? undefined : page.product.variants.pageInfo;
  }
  return { ...p, variants: { nodes } };
}

/** Completes the stock levels of a variant stocked at more than one page of locations. */
async function allLevels(client: ShopifyClient, v: FeedVariant): Promise<FeedVariant> {
  const item = v.inventoryItem;
  let info = item?.inventoryLevels.pageInfo;
  if (!item?.id || !info?.hasNextPage) return v;
  const nodes = [...item.inventoryLevels.nodes];
  while (info?.hasNextPage && info.endCursor) {
    const after: string = info.endCursor;
    const page: { inventoryItem: { inventoryLevels: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedLevel[] } } | null } = await client.graphql(FEED_MORE_LEVELS, { id: item.id, after });
    if (!page.inventoryItem) throw new Error('Voorraad per locatie kon niet volledig worden geladen.');
    nodes.push(...page.inventoryItem.inventoryLevels.nodes);
    info = page.inventoryItem.inventoryLevels.pageInfo.endCursor === after ? undefined : page.inventoryItem.inventoryLevels.pageInfo;
  }
  return { ...v, inventoryItem: { ...item, inventoryLevels: { nodes } } };
}

async function loadProducts(client: ShopifyClient, mode: 'test' | 'live', testProducts: string[]): Promise<FeedProduct[]> {
  const complete = async (list: FeedProduct[]) => {
    const out: FeedProduct[] = [];
    for (const p of list) {
      const full = p.variants.pageInfo?.hasNextPage ? await allVariants(client, p) : p;
      const variants: FeedVariant[] = [];
      for (const v of full.variants.nodes) variants.push(await allLevels(client, v));
      out.push({ ...full, variants: { ...full.variants, nodes: variants } });
    }
    return out;
  };
  if (mode === 'test') {
    if (!testProducts.length) return [];
    const { nodes } = await client.graphql<{ nodes: (FeedProduct | null)[] }>(FEED_PRODUCTS_BY_ID, { ids: testProducts });
    return complete(nodes.filter((n): n is FeedProduct => !!n && !!n.id));
  }
  const all: FeedProduct[] = [];
  let after: string | null = null;
  for (;;) {
    const page: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedProduct[] } } = await client.graphql(FEED_PRODUCTS, { after });
    all.push(...page.products.nodes);
    if (!page.products.pageInfo.hasNextPage || !page.products.pageInfo.endCursor || page.products.pageInfo.endCursor === after) break;
    after = page.products.pageInfo.endCursor;
  }
  return complete(all);
}

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'onbekende fout').slice(0, 300);

/** Runs the feed once. Safe from cron and the admin page: a second concurrent run is refused by the database. */
export async function runMerchantFeed(input: { trigger: 'cron' | 'manual'; actor: string }, deps: Deps = {}): Promise<FeedResult> {
  const db = deps.db ?? supabaseAdmin;
  const { data: settings, error: settingsError } = await db.from('merchant_feed_settings').select('mode,data_source,test_products,max_changes,store_codes').eq('id', true).maybeSingle();
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
  const insertLocal = deps.insertLocal ?? ((g: Google, name: string, inv: LocalInventory) => insertLocalInventory(g.sa, g.account, name, inv));
  const removeLocal = deps.removeLocal ?? ((g: Google, name: string, code: string) => deleteLocalInventory(g.sa, g.account, name, code));
  const storeCodes = (settings.store_codes ?? {}) as StoreCodes;

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
    // GTIN per model (marketing → Modellen & GTIN); a small table, read whole.
    const gtinRows: { model_key: string; gtin: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('model_gtins').select('model_key,gtin').order('model_key', { ascending: true }).range(from, from + 999);
      if (error) throw new Error('GTIN-tabel kon niet worden geladen.');
      for (const r of data ?? []) gtinRows.push({ model_key: r.model_key as string, gtin: r.gtin as string });
      if (!data || data.length < 1000) break;
    }
    const gtins = new Map([...gtinsByModel(gtinRows)].map(([k, r]) => [k, r.gtin]));
    // Stores where the checkout offers local pickup: those get "ophalen vandaag" in Google.
    const { locations } = await client.graphql<{ locations: { nodes: { id: string; isActive: boolean; localPickupSettingsV2: { pickupTime: string } | null }[] } }>(PICKUP_LOCATIONS);
    const pickup = pickupLocations(locations.nodes);
    const offers: FeedOffer[] = [];
    const skipped: Skip[] = [];
    for (const p of products) {
      const r = productOffers(p, { test, storeCodes, gtins, pickup });
      offers.push(...r.offers);
      if (r.skip) skipped.push(r.skip);
    }
    // The whole ledger, page by page (Supabase returns at most 1000 rows per request).
    const sentRows: SentRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from('merchant_feed_items').select('offer_id,hash,test,sent_at,local_hash,local_stores,local_sent_at').order('offer_id', { ascending: true }).range(from, from + 999);
      if (error) throw new Error('Verzonden producten konden niet worden geladen.');
      sentRows.push(...((data ?? []) as SentRow[]));
      if (!data || data.length < 1000) break;
    }
    const plan = planFeed(offers, sentRows, { test });
    Object.assign(counts, {
      products: products.length, offers: offers.length, unchanged: plan.unchanged, toSend: plan.upserts.length, toRefresh: plan.refreshes.length, toRemove: plan.deletes.length, localToSend: plan.local.length, stores: Object.values(storeCodes).length,
      skipped: skipped.length, skippedReasons: Object.fromEntries([...skipped.reduce((m, s) => m.set(s.reason, (m.get(s.reason) ?? 0) + 1), new Map<string, number>())]),
      ...(test ? { skippedList: skipped.slice(0, 20) } : {}),
    });

    if (plan.upserts.length + plan.deletes.length > settings.max_changes) {
      return await finish('stopped', `Noodrem: ${plan.upserts.length} producten versturen en ${plan.deletes.length} verwijderen is meer dan het ingestelde maximum (${settings.max_changes}). Er is niets naar Google gestuurd.`);
    }

    // Deletes first (they free offers), then new/changed offers, then refreshes of ageing offers (these are
    // not changes, so they do not count for the brake); at most MAX_WRITES_PER_RUN writes, the rest next run.
    const deletes = plan.deletes.slice(0, MAX_WRITES_PER_RUN);
    const changed = plan.upserts.slice(0, Math.max(0, MAX_WRITES_PER_RUN - deletes.length));
    const refreshes = plan.refreshes.slice(0, Math.max(0, MAX_WRITES_PER_RUN - deletes.length - changed.length));
    const upserts = [...changed, ...refreshes];
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
    // Stock per store, for offers Google already had before this run: stores that lost their code are
    // removed first, then every store with a code is (re)sent. Within the budget; the rest stays pending
    // (the ledger only moves on after success), so it follows in the next run.
    let localSent = 0;
    const localBudget = Math.max(0, MAX_WRITES_PER_RUN - deletes.length - upserts.length);
    const localUpdates: LocalUpdate[] = [];
    for (let used = 0, i = 0; i < plan.local.length; i++) {
      const cost = plan.local[i].removeStores.length + plan.local[i].offer.local.length;
      if (used + cost > localBudget) break;
      localUpdates.push(plan.local[i]); used += cost;
    }
    const previousStores = new Map(sentRows.map(r => [r.offer_id, r.local_stores ?? []]));
    await inBatches(localUpdates, async ({ offer: o, removeStores }) => {
      // Stores Google has stock for, kept up to date write by write, so a partial failure is still known.
      const published = new Set(previousStores.get(o.input.offerId) ?? []);
      try {
        const name = `${CONTENT_LANGUAGE}~${FEED_LABEL}~${o.input.offerId}`;
        for (const code of removeStores) { await removeLocal(google, name, code); published.delete(code); }
        // Every store is tried, also when another store fails (e.g. a store code Google does not know yet).
        const storeErrors: string[] = [];
        for (const inv of o.local) {
          try { await insertLocal(google, name, inv); published.add(inv.storeCode); }
          catch (e) { storeErrors.push(`${inv.storeCode}: ${errorText(e)}`); }
        }
        if (storeErrors.length) throw new Error(storeErrors.join('; '));
        const { error } = await db.from('merchant_feed_items').update({ local_hash: o.localHash || null, local_stores: o.local.map(l => l.storeCode), local_sent_at: new Date().toISOString() }).eq('offer_id', o.input.offerId);
        if (error) throw new Error('logboek niet bijgewerkt');
        localSent++;
      } catch (e) {
        failed.push({ offerId: o.input.offerId, reason: `winkelvoorraad: ${errorText(e)}` });
        // Pending: retried next run; the stores already written are remembered,
        // so a store that loses its code later is still removed at Google.
        // The hash is cleared, so the next run always repairs Google's (now partly updated) stock.
        await db.from('merchant_feed_items').update({ local_stores: [...published].sort(), local_hash: null }).eq('offer_id', o.input.offerId);
      }
    });
    Object.assign(counts, { sent, refreshed: refreshes.length, removed, localSent, localRemaining: plan.local.length - localUpdates.length, failed: failed.length, remaining: plan.upserts.length - changed.length + plan.refreshes.length - refreshes.length + plan.deletes.length - deletes.length, ...(failed.length ? { errors: failed.slice(0, 20) } : {}) });
    return await finish(failed.length ? 'failed' : 'succeeded', failed.length ? `${failed.length} product(en) konden niet naar Google; zie de details.` : undefined);
  } catch (e) {
    return await finish('failed', errorText(e));
  }
}
