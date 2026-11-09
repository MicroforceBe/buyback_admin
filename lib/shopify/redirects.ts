import 'server-only';
// 301 redirects for product pages that left the ERP. Shopify only follows a redirect when the path itself
// no longer resolves, which is the case for an archived product: so the redirect is made at archive time,
// not only at deletion. A redirect problem never fails the archive, restore or delete it belongs to.
import { APP_SCOPES, PRODUCT_INFO, type ShopifyClient } from '@/lib/shopify/client';
import { chooseRedirectTarget, siblingQuery, type RedirectCandidate } from '@/lib/shopify/redirectTarget';

type UserError = { message: string };
export type RedirectProduct = { id: string; title: string; handle: string; collectionHandle: string | null };
export type RedirectOutcome = { redirect: string | null; note: string | null };

const REDIRECT_BY_PATH = `query RedirectByPath($q: String!) { urlRedirects(first: 10, query: $q) { nodes { id path target } } }`;
const REDIRECTS_BY_TARGET = `query RedirectsByTarget($q: String!) { urlRedirects(first: 50, query: $q) { nodes { id path target } } }`;
const REDIRECT_CREATE = `mutation RedirectCreate($path: String!, $target: String!) { urlRedirectCreate(urlRedirect: { path: $path, target: $target }) { urlRedirect { id } userErrors { message } } }`;
const REDIRECT_UPDATE = `mutation RedirectUpdate($id: ID!, $target: String!) { urlRedirectUpdate(id: $id, urlRedirect: { target: $target }) { urlRedirect { id } userErrors { message } } }`;
const REDIRECT_DELETE = `mutation RedirectDelete($id: ID!) { urlRedirectDelete(id: $id) { deletedUrlRedirectId userErrors { message } } }`;
const SIBLINGS = `query Siblings($q: String!) { products(first: 20, query: $q) { nodes { handle title status totalInventory onlineStoreUrl } } }`;

const errors = (e: UserError[]) => e.map(x => x.message).join('; ');
const message = (error: unknown) => (error instanceof Error ? error.message : 'onbekende fout').slice(0, 300);

export async function hasRedirectScope(client: ShopifyClient): Promise<boolean> {
  try {
    const { currentAppInstallation } = await client.graphql<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(APP_SCOPES);
    return currentAppInstallation.accessScopes.some(s => s.handle === 'write_online_store_navigation');
  } catch {
    return false;
  }
}

/** Product handle, title and first collection, for products known only by id (the sync). */
export async function redirectProduct(client: ShopifyClient, id: string): Promise<RedirectProduct | null> {
  const { product } = await client.graphql<{ product: { id: string; title: string; handle: string; collections: { nodes: { handle: string }[] } } | null }>(PRODUCT_INFO, { id });
  return product ? { id: product.id, title: product.title, handle: product.handle, collectionHandle: product.collections.nodes[0]?.handle ?? null } : null;
}

async function siblings(client: ShopifyClient, title: string): Promise<RedirectCandidate[]> {
  try {
    const { products } = await client.graphql<{ products: { nodes: { handle: string; title: string; status: string; totalInventory: number | null; onlineStoreUrl: string | null }[] } }>(SIBLINGS, { q: siblingQuery(title) });
    return products.nodes.map(n => ({ handle: n.handle, title: n.title, status: n.status, stock: n.totalInventory ?? 0, online: !!n.onlineStoreUrl }));
  } catch {
    return []; // no sibling search: fall back to the collection
  }
}

/**
 * Points /products/<handle> to the best target (creating or updating the redirect) and re-points
 * existing redirects that targeted this product, so no chain ends on a dead page.
 */
export async function redirectArchived(client: ShopifyClient, p: RedirectProduct): Promise<RedirectOutcome> {
  const path = `/products/${p.handle}`;
  try {
    const target = chooseRedirectTarget(p, await siblings(client, p.title));
    const { urlRedirects } = await client.graphql<{ urlRedirects: { nodes: { id: string; path: string; target: string }[] } }>(REDIRECT_BY_PATH, { q: `path:"${path}"` });
    const existing = urlRedirects.nodes.find(r => r.path === path); // the search is fuzzy: exact match only
    if (existing) {
      if (existing.target !== target) {
        const { urlRedirectUpdate } = await client.graphql<{ urlRedirectUpdate: { userErrors: UserError[] } }>(REDIRECT_UPDATE, { id: existing.id, target });
        if (urlRedirectUpdate.userErrors.length) return { redirect: null, note: 'doorverwijzing mislukt: ' + errors(urlRedirectUpdate.userErrors) };
      }
    } else {
      const { urlRedirectCreate } = await client.graphql<{ urlRedirectCreate: { userErrors: UserError[] } }>(REDIRECT_CREATE, { path, target });
      if (urlRedirectCreate.userErrors.length) return { redirect: null, note: 'doorverwijzing mislukt: ' + errors(urlRedirectCreate.userErrors) };
    }
    let note: string | null = null;
    try {
      const { urlRedirects: pointing } = await client.graphql<{ urlRedirects: { nodes: { id: string; path: string; target: string }[] } }>(REDIRECTS_BY_TARGET, { q: `target:"${path}"` });
      for (const r of pointing.nodes) {
        if (r.target !== path || r.path === target) continue; // search is fuzzy: only exact matches; never a loop
        const { urlRedirectUpdate } = await client.graphql<{ urlRedirectUpdate: { userErrors: UserError[] } }>(REDIRECT_UPDATE, { id: r.id, target });
        if (urlRedirectUpdate.userErrors.length) note = 'oude doorverwijzing niet bijgewerkt: ' + errors(urlRedirectUpdate.userErrors);
      }
    } catch (error) {
      note = 'oude doorverwijzingen niet bijgewerkt: ' + message(error);
    }
    return { redirect: `${path} → ${target}`, note };
  } catch (error) {
    return { redirect: null, note: 'doorverwijzing mislukt: ' + message(error) };
  }
}

/** A restored product must be reachable again: its own redirect goes. */
export async function removeRedirect(client: ShopifyClient, handle: string): Promise<string | null> {
  const path = `/products/${handle}`;
  try {
    const { urlRedirects } = await client.graphql<{ urlRedirects: { nodes: { id: string; path: string }[] } }>(REDIRECT_BY_PATH, { q: `path:"${path}"` });
    const existing = urlRedirects.nodes.find(r => r.path === path);
    if (!existing) return null;
    const { urlRedirectDelete } = await client.graphql<{ urlRedirectDelete: { userErrors: UserError[] } }>(REDIRECT_DELETE, { id: existing.id });
    return urlRedirectDelete.userErrors.length ? 'doorverwijzing niet verwijderd: ' + errors(urlRedirectDelete.userErrors) : null;
  } catch (error) {
    return 'doorverwijzing niet verwijderd: ' + message(error);
  }
}

const ARCHIVED_PRODUCTS = `query ArchivedProducts($after: String) { products(first: 50, after: $after, query: "status:archived") { pageInfo { hasNextPage endCursor } nodes { id title handle collections(first: 1) { nodes { handle } } } } }`;

/**
 * One-off catch-up: every archived product without a redirect gets one. At most `max` new redirects and
 * 40 pages per call, so a click stays within the request time; `cursor` says where the next click resumes
 * (the start of the page that was not finished), so repeated clicks always finish the whole backlog.
 */
export async function redirectArchivedBacklog(client: ShopifyClient, opts: { max?: number; after?: string | null } = {}): Promise<{ scope: boolean; created: number; existing: number; failed: number; remaining: boolean; cursor: string | null; notes: string[] }> {
  const max = opts.max ?? 60;
  const out = { scope: await hasRedirectScope(client), created: 0, existing: 0, failed: 0, remaining: false, cursor: null as string | null, notes: [] as string[] };
  if (!out.scope) return out;
  type Page = { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: { id: string; title: string; handle: string; collections: { nodes: { handle: string }[] } }[] } };
  let after: string | null = opts.after ?? null;
  for (let page = 0; ; page++) {
    if (page >= 40) { out.remaining = true; out.cursor = after; return out; }
    const data: Page = await client.graphql<Page>(ARCHIVED_PRODUCTS, { after });
    for (const n of data.products.nodes) {
      const path = `/products/${n.handle}`;
      const { urlRedirects } = await client.graphql<{ urlRedirects: { nodes: { path: string }[] } }>(REDIRECT_BY_PATH, { q: `path:"${path}"` });
      if (urlRedirects.nodes.some(r => r.path === path)) { out.existing++; continue; }
      if (out.created + out.failed >= max) { out.remaining = true; out.cursor = after; return out; }
      const r = await redirectArchived(client, { id: n.id, title: n.title, handle: n.handle, collectionHandle: n.collections.nodes[0]?.handle ?? null });
      if (r.redirect) out.created++;
      else { out.failed++; if (r.note && out.notes.length < 5) out.notes.push(`${n.title}: ${r.note}`); }
    }
    if (!data.products.pageInfo.hasNextPage) return out;
    after = data.products.pageInfo.endCursor;
  }
}
