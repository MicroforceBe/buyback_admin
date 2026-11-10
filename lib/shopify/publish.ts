// Keeps every active (and unlisted: reachable by URL only) product on the Online Store: the ERP decides the status, but Shopify only
// shows a product on a channel it is published to, and products created or activated through the API
// are not published anywhere by themselves. Needs the app permissions read_publications and write_publications.
import { APP_SCOPES, type ShopifyClient } from '@/lib/shopify/client';

export const ONLINE_STORE_PUBLICATION = `query OnlineStorePublication { publications(first: 50) { nodes { id channels(first: 5) { nodes { handle } } } } }`;
export const ACTIVE_ON_STORE = `query ActiveOnStore($pub: ID!, $after: String) {
  products(first: 250, after: $after, query: "status:active OR status:unlisted") { pageInfo { hasNextPage endCursor } nodes { id title onStore: publishedOnPublication(publicationId: $pub) } }
}`;
export const PRODUCTS_ON_STORE = `query ProductsOnStore($ids: [ID!]!, $pub: ID!) { nodes(ids: $ids) { ... on Product { id title onStore: publishedOnPublication(publicationId: $pub) } } }`;
export const PUBLISH_ON_STORE = `mutation PublishOnStore($id: ID!, $pub: ID!) { publishablePublish(id: $id, input: [{ publicationId: $pub }]) { userErrors { field message } } }`;

/** At most this many products are published per run; the rest follow in the next run. */
export const MAX_PUBLISH_PER_RUN = 200;
const REQUIRED = ['read_publications', 'write_publications'];

type ActivePage = { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; title: string; onStore: boolean }[] } };

export type PublishResult =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; candidates: number; published: number; failed: { productId: string; title: string; reason: string }[]; remaining: number };

/**
 * Finds active products that are not on the Online Store and (unless dryRun) publishes them; with
 * onlyProducts, only those products (the ones the ERP sync manages).
 * Read-only in shadow mode: only the number that would be published is returned.
 */
export async function publishActiveOnOnlineStore(client: ShopifyClient, opts: { dryRun: boolean; stillLive?: () => Promise<boolean>; onlyProducts?: Set<string>; max?: number; activating?: Set<string> }): Promise<PublishResult> {
  const { currentAppInstallation } = await client.graphql<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(APP_SCOPES);
  const have = new Set((currentAppInstallation?.accessScopes ?? []).map(s => s.handle));
  const missing = REQUIRED.filter(s => !have.has(s));
  if (missing.length) return { status: 'skipped', reason: `de app mist het recht ${missing.join(' en ')}` };

  // channels is nullable in the schema: a publication without it is simply not the Online Store.
  const { publications } = await client.graphql<{ publications: { nodes: { id: string; channels: { nodes: { handle: string }[] } | null }[] } }>(ONLINE_STORE_PUBLICATION);
  const pub = publications.nodes.find(p => p.channels?.nodes?.some(c => c.handle === 'online_store'))?.id;
  if (!pub) return { status: 'skipped', reason: 'geen Online Store-kanaal gevonden' };

  const hidden: { id: string; title: string }[] = [];
  // The whole active catalogue is scanned every run (already-published products are part of the result,
  // so a page limit would hide everything past it); the loop only stops when Shopify returns no new cursor.
  let after: string | null = null;
  for (;;) {
    const page: ActivePage = await client.graphql<ActivePage>(ACTIVE_ON_STORE, { pub, after });
    const { products } = page;
    // Only products that come from the ERP: a product made by hand in Shopify keeps its own channels.
    for (const p of products.nodes) if (!p.onStore && (!opts.onlyProducts || opts.onlyProducts.has(p.id))) hidden.push({ id: p.id, title: p.title });
    if (!products.pageInfo.hasNextPage || !products.pageInfo.endCursor || products.pageInfo.endCursor === after) break;
    after = products.pageInfo.endCursor;
  }
  // Preview only: products this run is about to activate are not active yet, but will need publishing too.
  if (opts.dryRun && opts.activating?.size) {
    const known = new Set(hidden.map(h => h.id));
    const ids = [...opts.activating].filter(id => !known.has(id) && (!opts.onlyProducts || opts.onlyProducts.has(id)));
    for (let i = 0; i < ids.length; i += 250) {
      const { nodes } = await client.graphql<{ nodes: ({ id: string; title: string; onStore: boolean } | null)[] }>(PRODUCTS_ON_STORE, { ids: ids.slice(i, i + 250), pub });
      for (const n of nodes) if (n && n.id && !n.onStore) hidden.push({ id: n.id, title: n.title });
    }
  }
  if (opts.dryRun) return { status: 'done', candidates: hidden.length, published: 0, failed: [], remaining: hidden.length };

  const batch = hidden.slice(0, Math.max(0, Math.min(MAX_PUBLISH_PER_RUN, opts.max ?? MAX_PUBLISH_PER_RUN)));
  const failed: { productId: string; title: string; reason: string }[] = [];
  let published = 0;
  for (const p of batch) {
    if (opts.stillLive && !(await opts.stillLive())) break;
    try {
      const { publishablePublish } = await client.graphql<{ publishablePublish: { userErrors: { message: string }[] } }>(PUBLISH_ON_STORE, { id: p.id, pub });
      if (publishablePublish.userErrors.length) failed.push({ productId: p.id, title: p.title, reason: publishablePublish.userErrors.map(e => e.message).join('; ').slice(0, 300) });
      else published++;
    } catch (e) {
      failed.push({ productId: p.id, title: p.title, reason: (e instanceof Error ? e.message : 'onbekende fout').slice(0, 300) });
    }
  }
  return { status: 'done', candidates: hidden.length, published, failed, remaining: hidden.length - published - failed.length };
}

/** Run counts for the sync overview. */
export function publishCounts(r: PublishResult): Record<string, unknown> {
  if (r.status === 'skipped') return { onlineStorePublish: `overgeslagen: ${r.reason}` };
  return { onlineStoreHidden: r.candidates, onlineStorePublished: r.published, onlineStorePublishFailed: r.failed.length,
    ...(r.failed.length ? { onlineStorePublishErrors: r.failed.slice(0, 10).map(f => `${f.title}: ${f.reason}`) } : {}) };
}

/**
 * Products the sync really manages: at least one variant whose SKU is in the ERP and occurs
 * only once in Shopify. Duplicate SKUs are ambiguous and skipped by planSync, so they are never
 * published automatically either.
 */
/** How many publications a run would write: at most MAX_PUBLISH_PER_RUN. */
export function plannedPublications(r: PublishResult): number {
  return r.status === 'done' ? Math.min(r.candidates, MAX_PUBLISH_PER_RUN) : 0;
}

/** Product ids touched by failed writes (failures may name a product, variant or inventory item). */
export function failedProducts(failureIds: Iterable<string>, variants: { productId: string; variantId: string; inventoryItemId: string }[]): Set<string> {
  const byId = new Map<string, string>();
  for (const v of variants) { byId.set(v.productId, v.productId); byId.set(v.variantId, v.productId); byId.set(v.inventoryItemId, v.productId); }
  const out = new Set<string>();
  for (const id of failureIds) { const p = byId.get(id); if (p) out.add(p); }
  return out;
}

export function erpMatchedProducts(erpSkus: Iterable<string>, variants: { sku: string | null; productId: string }[]): Set<string> {
  const erp = new Set(erpSkus);
  const seen = new Map<string, number>();
  for (const v of variants) if (v.sku) seen.set(v.sku, (seen.get(v.sku) ?? 0) + 1);
  return new Set(variants.filter(v => v.sku && erp.has(v.sku) && seen.get(v.sku) === 1).map(v => v.productId));
}
