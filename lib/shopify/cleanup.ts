import 'server-only';
// Archives, restores or deletes Shopify products that are no longer in the ERP, with fresh checks at
// the moment of the action and a log line per product.
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { APP_SCOPES, createShopifyClient, PRODUCT_DELETE, PRODUCT_INFO, PRODUCT_SET_STATUS, shopifyConfig, URL_REDIRECT_CREATE, type ShopifyClient } from '@/lib/shopify/client';
import { checkRemoval, redirectTarget, type RemovalAction, type ShopifyProductInfo } from '@/lib/shopify/removal';

type Db = typeof supabaseAdmin;
type UserError = { message: string };
export type RemovalResult = { action: RemovalAction; ok: number; refused: number; failed: number; redirects: number; redirectScope: boolean; logError?: string };

// A nearly empty ERP table means a broken import: never archive or delete on that basis.
const MIN_ERP_ARTICLES = 500;

async function erpSkus(db: Db): Promise<Set<string>> {
  const skus = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('erp_articles').select('sku').eq('missing_from_erp', false).order('sku').range(from, from + 999);
    if (error) throw new Error('ERP-artikelen konden niet worden geladen.');
    for (const r of data ?? []) if (r.sku) skus.add(String(r.sku).trim());
    if (!data || data.length < 1000) break;
  }
  return skus;
}

/** When our tool last archived each product (only if that is still the latest successful action). */
async function archivedAt(db: Db, ids: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (!ids.length) return map;
  const seen = new Set<string>();
  // Paginated: Supabase returns at most 1000 rows per request.
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('shopify_product_removals').select('product_id,action,created_at')
      .in('product_id', ids).eq('result', 'ok').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
    if (error) throw new Error('Logboek kon niet worden gelezen.');
    for (const r of data ?? []) {
      if (seen.has(r.product_id)) continue;
      seen.add(r.product_id);
      if (r.action === 'archive') map.set(r.product_id, new Date(r.created_at));
    }
    if (!data || data.length < 1000 || seen.size === ids.length) break;
  }
  return map;
}

export async function runRemoval(input: { action: RemovalAction; ids: string[]; includeStock: boolean; actor: string }, deps: { db?: Db; client?: ShopifyClient | null; now?: () => Date } = {}): Promise<RemovalResult> {
  const db = deps.db ?? supabaseAdmin;
  const client = deps.client !== undefined ? deps.client : (() => { const cfg = shopifyConfig(); return cfg ? createShopifyClient(cfg) : null; })();
  if (!client) throw new Error('Shopify is niet gekoppeld.');
  const ids = [...new Set(input.ids.filter(id => /^gid:\/\/shopify\/Product\/\d+$/.test(id)))];
  if (!ids.length) throw new Error('Geen artikelen geselecteerd.');

  const skus = await erpSkus(db);
  if (skus.size < MIN_ERP_ARTICLES) throw new Error(`De ERP-gegevens lijken onvolledig (${skus.size} artikelen); er wordt niets gewijzigd.`);

  type Level = { quantities: { quantity: number }[] };
  type ProductNode = { id: string; title: string; handle: string; status: ShopifyProductInfo['status']; collections: { nodes: { handle: string }[] };
    variants: { pageInfo: { hasNextPage: boolean }; nodes: { sku: string | null; inventoryItem: { inventoryLevels: { pageInfo: { hasNextPage: boolean }; nodes: Level[] } } | null }[] } };
  const products: ShopifyProductInfo[] = [];
  for (const id of ids.slice(0, 100)) {
    const { product: n } = await client.graphql<{ product: ProductNode | null }>(PRODUCT_INFO, { id });
    if (!n) continue;
    const levels = n.variants.nodes.map(v => v.inventoryItem?.inventoryLevels);
    const quantities = levels.flatMap(l => l?.nodes ?? []).flatMap(l => l.quantities.map(q => q.quantity));
    products.push({
      id: n.id, title: n.title, handle: n.handle, status: n.status,
      positiveStock: quantities.filter(q => q > 0).reduce((a, b) => a + b, 0),
      skus: n.variants.nodes.map(v => (v.sku ?? '').trim()).filter(Boolean),
      allVariantsChecked: !n.variants.pageInfo.hasNextPage && levels.every(l => l && !l.pageInfo.hasNextPage),
      collectionHandle: n.collections.nodes[0]?.handle ?? null,
    });
  }

  const check = checkRemoval({ action: input.action, requestedIds: ids, products, erpSkus: skus, includeStock: input.includeStock, archivedAt: await archivedAt(db, ids), now: deps.now?.() ?? new Date() });

  let redirectScope = false;
  if (input.action === 'delete' && check.ok.length) {
    try {
      const { currentAppInstallation } = await client.graphql<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(APP_SCOPES);
      redirectScope = currentAppInstallation.accessScopes.some(s => s.handle === 'write_online_store_navigation');
    } catch { redirectScope = false; }
  }

  // The log is functional state (it drives the 30-day delete flow), so every outcome is stored right
  // after its Shopify call; if storing fails, the run stops and the operator gets a recovery hint.
  const persist = async (rows: Record<string, unknown>[]) => {
    if (!rows.length) return true;
    const { error } = await db.from('shopify_product_removals').insert(rows);
    return !error;
  };
  const log: Record<string, unknown>[] = check.refused.map(r => ({ product_id: r.id, title: r.title.slice(0, 255), skus: products.find(p => p.id === r.id)?.skus ?? [], action: input.action, result: 'refused', detail: r.reason.slice(0, 1000), actor: input.actor }));
  let ok = 0, failed = 0, redirects = 0;
  if (!(await persist(log))) return { action: input.action, ok: 0, refused: check.refused.length, failed: 0, redirects: 0, redirectScope, logError: 'Het logboek kon niet worden bijgewerkt; er is niets gewijzigd in Shopify.' };
  for (const p of check.ok) {
    let row: Record<string, unknown>;
    const base = { product_id: p.id, title: p.title.slice(0, 255), skus: p.skus, action: input.action, actor: input.actor, previous_status: p.status };
    try {
      if (input.action === 'delete') {
        const { productDelete } = await client.graphql<{ productDelete: { deletedProductId: string | null; userErrors: UserError[] } }>(PRODUCT_DELETE, { id: p.id }, { retryServerErrors: false });
        if (productDelete.userErrors.length || !productDelete.deletedProductId) throw new Error(productDelete.userErrors.map(e => e.message).join('; ') || 'niet verwijderd');
        let redirect: string | null = null;
        let note: string | null = redirectScope ? null : 'geen doorverwijzing: recht write_online_store_navigation ontbreekt';
        if (redirectScope) {
          // The product is already gone: a redirect problem never turns the deletion into a failure.
          const target = redirectTarget(p);
          try {
            const { urlRedirectCreate } = await client.graphql<{ urlRedirectCreate: { userErrors: UserError[] } }>(URL_REDIRECT_CREATE, { path: `/products/${p.handle}`, target });
            if (urlRedirectCreate.userErrors.length) note = 'doorverwijzing mislukt: ' + urlRedirectCreate.userErrors.map(e => e.message).join('; ');
            else { redirect = `/products/${p.handle} → ${target}`; redirects++; }
          } catch (error) {
            note = 'doorverwijzing mislukt: ' + (error instanceof Error ? error.message : 'onbekende fout');
          }
        }
        row = { ...base, result: 'ok', redirect, detail: note };
      } else {
        // Restore puts the product back as draft: the ERP or a person decides when it goes live again.
        const status = input.action === 'archive' ? 'ARCHIVED' : 'DRAFT';
        const { productUpdate } = await client.graphql<{ productUpdate: { userErrors: UserError[] } }>(PRODUCT_SET_STATUS, { product: { id: p.id, status } });
        if (productUpdate.userErrors.length) throw new Error(productUpdate.userErrors.map(e => e.message).join('; '));
        row = { ...base, result: 'ok' };
      }
      ok++;
    } catch (error) {
      failed++;
      row = { ...base, result: 'failed', detail: (error instanceof Error ? error.message : 'onbekende fout').slice(0, 1000) };
    }
    if (!(await persist([row]))) {
      const hint = input.action === 'archive'
        ? `"${p.title}" is wel gearchiveerd in Shopify maar staat niet in het logboek. Zet het terug als concept en archiveer opnieuw.`
        : input.action === 'delete' ? `"${p.title}" is ${row.result === 'ok' ? 'wel verwijderd' : 'niet verwijderd'} in Shopify maar het logboek kon niet worden bijgewerkt.`
        : `"${p.title}" is ${row.result === 'ok' ? 'wel teruggezet' : 'niet teruggezet'} maar het logboek kon niet worden bijgewerkt.`;
      return { action: input.action, ok, refused: check.refused.length, failed, redirects, redirectScope, logError: `Logboekfout, de actie is gestopt. ${hint}` };
    }
  }
  return { action: input.action, ok, refused: check.refused.length, failed, redirects, redirectScope };
}
