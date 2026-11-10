import 'server-only';
// One Shopify sync run: ERP CSV rows -> desired state -> compare with Shopify -> record changes,
// and in live mode write them in batches. Modes: off (nothing), shadow (record only), live (write).
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig, ShopifyError, INVENTORY_SET, METAFIELDS_DELETE, METAFIELDS_SET, PRODUCT_CREATE, PRODUCT_UPDATE, REFERENCE_METAFIELDS, VARIANTS_UPDATE, type ShopifyClient } from '@/lib/shopify/client';
import { enrichMetafields, photoCandidates, pickImages, starsOf, type MetafieldValue, type RefImage } from '@/lib/shopify/enrich';
import { BULK_VARIANTS_QUERY, parseBulkVariants } from '@/lib/shopify/state';
import { pickDescription } from '@/lib/shopify/seo';
import { erpMatchedProducts, failedProducts, plannedPublications, publishActiveOnOnlineStore, publishCounts } from '@/lib/shopify/publish';
import { addStoreLists, chunk, desiredFromRow, metafieldId, STORE_METAFIELD, duplicateTitles, isRefurbishedTitle, MAX_UNLIST_PER_RUN, NO_DESCRIPTION_TAG, planCreates, planDeactivateMissing, planMissing, planSync, rankSimilar, type CurrentState, type DesiredState, type Plan, type ProductSetInput } from '@/lib/shopify/plan';
import { hasRedirectScope, redirectArchived, redirectProduct } from '@/lib/shopify/redirects';

export type SyncMode = 'off' | 'shadow' | 'live';
export type SyncResult =
  | { status: 'skipped'; reason: 'off' | 'running' | 'not_configured' }
  | { status: 'succeeded' | 'failed' | 'stopped'; runId: string; mode: Exclude<SyncMode, 'off'>; counts: Record<string, unknown>; error?: string };

const MAX_RECORDED_CHANGES = 5000;
const MAX_UNMATCHED = 2000;
// New draft products: at most this many per run (the rest follows in the next runs), and none at all
// when the number of new SKUs looks like a broken export (e.g. changed SKU format).
const MAX_CREATES_PER_RUN = 50;
const MAX_NEW_CANDIDATES = 200;
// Most similar existing products whose properties are read for a new draft.
const MAX_REFERENCES = 15;
const REFERENCE_BATCH = 5;
const ARCHIVE_MISSING_AFTER_HOURS = 24;
// An active product without any SKU in the ERP goes to draft after this delay (a single incomplete import does no harm).
const DEACTIVATE_MISSING_AFTER_HOURS = 1;
// More than this many articles disappearing within an hour looks like a broken export: do nothing.
const MAX_NEWLY_MISSING = 100;
export const CREATE_FIELD = 'nieuw artikel (draft)';
const STALE_RUN_MINUTES = 10; // maxDuration is 5 minutes
const KEEP_RUNS_DAYS = 30;
// Runs that changed nothing and had no problem are only useful for a day.
const KEEP_QUIET_RUNS_HOURS = 24;

type Db = typeof supabaseAdmin;
type Deps = { db?: Db; client?: ShopifyClient | null; idempotencyKey?: () => string };

class StoppedByOperator extends Error {}

type UserError = { field?: string[] | null; message: string };
const errorText = (errors: UserError[]) => errors.map(e => e.message).join('; ').slice(0, 900);

/**
 * Splits user errors over the items of a batch by the index in their field path
 * (e.g. ["variants","3","price"]). Only for mutations that allow partial success
 * (productVariantsBulkUpdate with allowPartialUpdates). Errors without an index
 * cannot be attributed and count for the whole batch.
 */
function failedItems<T>(items: T[], errors: UserError[]): { item: T; reason: string }[] {
  const byIndex = new Map<number, UserError[]>();
  const general: UserError[] = [];
  for (const e of errors) {
    const index = (e.field ?? []).map(f => (/^\d+$/.test(f) ? Number(f) : NaN)).find(n => Number.isInteger(n) && n < items.length);
    if (index === undefined) general.push(e); else byIndex.set(index, [...(byIndex.get(index) ?? []), e]);
  }
  if (general.length) return items.map((item, i) => ({ item, reason: errorText([...general, ...(byIndex.get(i) ?? [])]) }));
  return [...byIndex].map(([i, errs]) => ({ item: items[i], reason: errorText(errs) }));
}

// The ERP import rewrites every row of the export (updated_at = now) every 15 minutes. A row that
// is clearly older than the newest one was not in the recent exports and no longer counts as ERP.
// 40 minutes = missed at least two imports, so one failed or half-finished import never counts.
const NOT_IN_EXPORT_AFTER_MINUTES = 40;

async function loadDesired(db: Db): Promise<{ desired: DesiredState[]; invalid: number; notInExport: number }> {
  const rows: { sku: string; raw_erp_row: unknown; updated_at: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('erp_articles').select('sku,raw_erp_row,updated_at').eq('missing_from_erp', false).order('sku').range(from, from + 999);
    if (error) throw new Error('ERP-artikelen konden niet worden geladen.');
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const newest = Math.max(0, ...rows.map(r => (r.updated_at ? Date.parse(r.updated_at) : 0)).filter(Number.isFinite));
  const cutoff = newest - NOT_IN_EXPORT_AFTER_MINUTES * 60_000;
  const desired: DesiredState[] = [];
  let invalid = 0, notInExport = 0;
  for (const row of rows) {
    if (newest && row.updated_at && Date.parse(row.updated_at) < cutoff) { notInExport++; continue; }
    const d = row.raw_erp_row && typeof row.raw_erp_row === 'object' ? desiredFromRow(row.raw_erp_row as Record<string, unknown>) : null;
    if (d && d.sku === row.sku) desired.push(d); else invalid++;
  }
  return { desired, invalid, notInExport };
}

type Scope = 'product' | 'variant' | 'inventory' | 'metafield';
/** field: the location name or metafield id when only that field failed; absent = every field of the scope. */
type Failure = { id: string; scope: Scope; field?: string; reason: string };
// Shopify accepts at most 250 items per input array.
const MAX_INPUT_ITEMS = 250;

/**
 * Writes the plan to Shopify in batches. Returns the failed writes with the Shopify id (product,
 * variant, inventory item or metafield owner) and the scope, so only the affected changes are marked.
 */
async function applyPlan(client: ShopifyClient, plan: Plan, runId: string, key: () => string, stillLive: () => Promise<boolean>, locationNameById: Map<string, string>, creates: { sku: string; input: ProductSetInput }[], afterProductUpdate: (id: string) => Promise<void> = async () => {}, productOfItem: Map<string, string> = new Map()): Promise<Failure[]> {
  const failed: Failure[] = [];
  // The emergency stop must take effect mid-run: the persisted mode is rechecked before every write.
  const guard = async () => { if (!(await stillLive())) throw new StoppedByOperator(); };
  for (const update of plan.productUpdates) {
    await guard();
    const { productUpdate } = await client.graphql<{ productUpdate: { userErrors: UserError[] } }>(PRODUCT_UPDATE, { product: update });
    if (productUpdate.userErrors.length) failed.push({ id: update.id, scope: 'product', reason: errorText(productUpdate.userErrors) });
    else await afterProductUpdate(update.id);
  }
  for (const group of plan.variantUpdates) {
    for (const variants of chunk(group.variants, MAX_INPUT_ITEMS)) {
      await guard();
      const { productVariantsBulkUpdate } = await client.graphql<{ productVariantsBulkUpdate: { userErrors: UserError[] } }>(VARIANTS_UPDATE, { productId: group.productId, variants });
      for (const { item, reason } of failedItems(variants, productVariantsBulkUpdate.userErrors)) failed.push({ id: item.id, scope: 'variant', reason });
    }
  }
  for (const batch of chunk(plan.inventory, 100)) {
    await guard();
    const { inventorySetQuantities } = await client.graphql<{ inventorySetQuantities: { userErrors: UserError[] } }>(INVENTORY_SET, {
      input: { name: 'available', reason: 'correction', referenceDocumentUri: `microforce://erp-sync/${runId}`, quantities: batch.map(q => ({ ...q, changeFromQuantity: null })) },
      key: key(),
    });
    // Atomic mutation: any error means nothing in this batch was written.
    if (inventorySetQuantities.userErrors.length) for (const q of batch) failed.push({ id: q.inventoryItemId, scope: 'inventory', field: locationNameById.get(q.locationId) ?? q.locationId, reason: errorText(inventorySetQuantities.userErrors) });
  }
  // The store list was computed from the planned stock: when a stock write of that product failed, it is not
  // written (the next run computes it again from the real stock) and the change is reported as failed.
  const failedInventory = new Set(failed.filter(f => f.scope === 'inventory').map(f => f.id));
  const failedStockProducts = new Set(plan.inventory.filter(q => failedInventory.has(q.inventoryItemId)).map(q => productOfItem.get(q.inventoryItemId)).filter((id): id is string => !!id));
  const storeField = metafieldId(STORE_METAFIELD);
  const skipStore = (m: { ownerId: string; namespace: string; key: string }) => metafieldId(m) === storeField && failedStockProducts.has(m.ownerId);
  for (const m of [...plan.metafields, ...plan.metafieldDeletes]) if (skipStore(m)) failed.push({ id: m.ownerId, scope: 'metafield', field: storeField, reason: 'Niet geschreven: de voorraadwijziging van dit product mislukte.' });
  const metafieldSets = plan.metafields.filter(m => !skipStore(m));
  const metafieldDeletes = plan.metafieldDeletes.filter(m => !skipStore(m));
  for (const batch of chunk(metafieldSets, 25)) {
    await guard();
    const { metafieldsSet } = await client.graphql<{ metafieldsSet: { userErrors: UserError[] } }>(METAFIELDS_SET, { metafields: batch });
    // metafieldsSet is atomic: any error means nothing in this batch was written.
    if (metafieldsSet.userErrors.length) for (const m of batch) failed.push({ id: m.ownerId, scope: 'metafield', field: `${m.namespace}.${m.key}`, reason: errorText(metafieldsSet.userErrors) });
  }
  for (const batch of chunk(metafieldDeletes, 25)) {
    await guard();
    const { metafieldsDelete } = await client.graphql<{ metafieldsDelete: { userErrors: UserError[] } }>(METAFIELDS_DELETE, { metafields: batch });
    if (metafieldsDelete.userErrors.length) for (const m of batch) failed.push({ id: m.ownerId, scope: 'metafield', field: `${m.namespace}.${m.key}`, reason: errorText(metafieldsDelete.userErrors) });
  }
  for (const c of creates) {
    await guard();
    const { productSet } = await client.graphql<{ productSet: { product: { id: string } | null; userErrors: UserError[] } }>(PRODUCT_CREATE, { input: c.input }, { retryServerErrors: false });
    if (productSet.userErrors.length || !productSet.product) failed.push({ id: `new:${c.sku}`, scope: 'product', field: CREATE_FIELD, reason: errorText(productSet.userErrors.length ? productSet.userErrors : [{ message: 'Shopify maakte het product niet aan.' }]) });
  }
  return failed;
}

type MissingInfo = { since: Date; held: boolean; released: boolean };

/**
 * Records since when each Shopify-only SKU is missing from the ERP and forgets SKUs that are back.
 * When more than MAX_NEWLY_MISSING SKUs disappear within an hour, those SKUs are put on hold: they
 * are never zeroed or archived until an admin releases them or they return to the ERP.
 */
async function trackMissing(db: Db, missing: CurrentState[]): Promise<{ info: Map<string, MissingInfo>; heldNow: number }> {
  const info = new Map<string, MissingInfo>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('shopify_sku_missing').select('sku,first_missing_at,held,released').order('sku').range(from, from + 999);
    if (error) throw new Error('Ontbrekende artikelen konden niet worden geladen.');
    for (const r of data ?? []) info.set(r.sku as string, { since: new Date(r.first_missing_at as string), held: r.held === true, released: r.released === true });
    if (!data || data.length < 1000) break;
  }
  const now = new Date();
  const current = new Set(missing.map(v => v.sku));
  const fresh = missing.filter(v => !info.has(v.sku)).map(v => ({ sku: v.sku, product_id: v.productId, first_missing_at: now.toISOString() }));
  for (const batch of chunk(fresh, 500)) {
    const { error: e } = await db.from('shopify_sku_missing').upsert(batch, { onConflict: 'sku', ignoreDuplicates: true });
    if (e) throw new Error('Ontbrekende artikelen konden niet worden opgeslagen.');
    for (const r of batch) info.set(r.sku, { since: now, held: false, released: false });
  }
  const back = [...info.keys()].filter(sku => !current.has(sku));
  for (const batch of chunk(back, 200)) {
    const { error: e } = await db.from('shopify_sku_missing').delete().in('sku', batch);
    if (e) throw new Error('Ontbrekende artikelen konden niet worden bijgewerkt.');
    for (const sku of batch) info.delete(sku);
  }
  // Suspicious batch: everything that disappeared in the last hour and is neither held nor released.
  const recent = [...info.entries()].filter(([, i]) => !i.held && !i.released && now.getTime() - i.since.getTime() < 3_600_000).map(([sku]) => sku);
  let heldNow = 0;
  if (recent.length > MAX_NEWLY_MISSING) {
    for (const batch of chunk(recent, 200)) {
      const { error: e } = await db.from('shopify_sku_missing').update({ held: true }).in('sku', batch);
      if (e) throw new Error('Ontbrekende artikelen konden niet worden vastgehouden.');
    }
    for (const sku of recent) info.get(sku)!.held = true;
    heldNow = recent.length;
  }
  return { info, heldNow };
}

/**
 * Runs one sync. Safe to call from cron and from the admin page: a second concurrent run is
 * refused by the database, and nothing is written to Shopify unless the mode is 'live'.
 */
export async function runShopifySync(input: { trigger: 'cron' | 'manual'; actor: string }, deps: Deps = {}): Promise<SyncResult> {
  const db = deps.db ?? supabaseAdmin;
  const key = deps.idempotencyKey ?? randomUUID;

  const { data: settings, error: settingsError } = await db.from('shopify_sync_settings').select('mode,max_changes,create_drafts,handle_missing').eq('id', true).maybeSingle();
  if (settingsError || !settings) throw new Error('Shopify-instellingen konden niet worden geladen.');
  const mode = settings.mode as SyncMode;
  if (mode === 'off') return { status: 'skipped', reason: 'off' };

  let client: ShopifyClient | null;
  try {
    client = deps.client !== undefined ? deps.client : (() => { const cfg = shopifyConfig(); return cfg ? createShopifyClient(cfg) : null; })();
  } catch (error) {
    client = null;
    if (error instanceof ShopifyError) throw error;
  }
  if (!client) return { status: 'skipped', reason: 'not_configured' };

  // A run that crashed (e.g. a function timeout) must not block the sync forever.
  await db.from('shopify_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: 'Afgebroken: de run duurde te lang of de server stopte.' })
    .eq('status', 'running').lt('started_at', new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString());

  const { data: run, error: runError } = await db.from('shopify_sync_runs').insert({ trigger: input.trigger, mode, started_by: input.actor }).select('id').single();
  if (runError?.code === '23505') return { status: 'skipped', reason: 'running' };
  if (runError || !run) throw new Error('Synchronisatie kon niet starten.');
  const runId = run.id as string;

  const finish = async (status: 'succeeded' | 'failed' | 'stopped', counts: Record<string, unknown>, error?: string): Promise<SyncResult> => {
    await db.from('shopify_sync_runs').update({ status, counts, error: error ?? null, finished_at: new Date().toISOString() }).eq('id', runId);
    await db.from('shopify_sync_runs').delete().lt('started_at', new Date(Date.now() - KEEP_RUNS_DAYS * 86_400_000).toISOString());
    // Quiet runs (succeeded, 0 changes) after 24 hours; runs with changes, errors, brake or stop stay 30 days.
    await db.from('shopify_sync_runs').delete().eq('status', 'succeeded').eq('counts->>changes', '0').neq('id', runId)
      .lt('started_at', new Date(Date.now() - KEEP_QUIET_RUNS_HOURS * 3_600_000).toISOString());
    return { status, runId, mode, counts, ...(error ? { error } : {}) };
  };

  const counts: Record<string, unknown> = {};
  let writing = false;
  try {
    const { desired, invalid, notInExport } = await loadDesired(db);
    const [jsonl, apiLocations] = await Promise.all([client.bulkQuery(BULK_VARIANTS_QUERY), client.locations()]);
    const state = parseBulkVariants(jsonl);
    const locations = { ...state.locations, ...apiLocations };
    // Store lists are added further on, once every stock write of this run is planned.
    const plan = planSync({ desired, current: state.variants, locations, invalidRows: invalid, deferStores: true });
    // Lists (capped) of SKUs that are not synced, so the admin page can show and filter them.
    const cap = (list: Plan['unmatched']['erpOnly']) => list.slice(0, MAX_UNMATCHED).map(u => ({ sku: u.sku, title: u.title.slice(0, 200), inventory: u.inventory, ...(u.productId ? { productId: u.productId } : {}), ...(u.status ? { status: u.status } : {}) }));
    Object.assign(counts, plan.counts, {
      changes: plan.changes.length, shopifyVariants: state.variants.length,
      duplicateTitleList: duplicateTitles(desired, state.variants).slice(0, MAX_UNMATCHED).map(a => ({ ...a, title: a.title.slice(0, 200) })),
      duplicateTitles: duplicateTitles(desired, state.variants).length,
      erpOnlySkus: cap(plan.unmatched.erpOnly), shopifyOnlySkus: cap(plan.unmatched.shopifyOnly), shopifyOnlyArchivedSkus: cap(plan.unmatched.shopifyOnlyArchived), duplicateSkuList: cap(plan.unmatched.duplicate),
    });

    // New ERP articles become draft products (only when enabled in the settings).
    let creates: { sku: string; input: ProductSetInput; categoryFrom: string | null }[] = [];
    if (settings.create_drafts === true) {
      if (plan.newCandidates.length > MAX_NEW_CANDIDATES) {
        counts.createBlocked = `${plan.newCandidates.length} nieuwe artikelen is verdacht veel (maximum ${MAX_NEW_CANDIDATES}); er worden geen concepten aangemaakt. Controleer het ERP-bestand.`;
      } else {
        const planned = planCreates(plan.newCandidates, locations, { shopifyTitles: state.variants.map(v => v.title), erpTitles: desired.map(d => d.product.title ?? '').filter(Boolean), existing: state.variants.map(v => ({ sku: v.sku, title: v.title, tags: v.tags })) });
        creates = planned.creates.slice(0, MAX_CREATES_PER_RUN);
        counts.newDrafts = creates.length;
        counts.newDuplicateTitles = creates.filter(c => c.input.tags.includes('controle-dubbele-titel')).length;
        counts.newDraftsPending = planned.creates.length - creates.length;
        counts.newSkipped = planned.skipped.slice(0, MAX_UNMATCHED);
        // Properties of the new drafts from their title and the most similar existing products.
        const products = state.variants.map(v => ({ sku: v.sku, title: v.title, productId: v.productId }));
        const metafieldCache = new Map<string, MetafieldValue[]>();
        const imageCache = new Map<string, RefImage[]>();
        const descriptionCache = new Map<string, string>();
        const descriptionFrom = new Map<string, string>();
        const imageCount = new Map<string, number>();
        const enrichedCount = new Map<string, number>();
        for (const c of creates) {
          const ranked = rankSimilar(c.sku, c.input.title, products);
          const stars = starsOf(c.input.title);
          const picked = ranked.slice(0, MAX_REFERENCES);
          const sameStars = ranked.find(r => starsOf(r.title) === stars);
          if (sameStars && !picked.includes(sameStars)) picked.push(sameStars);
          // Photo sources are chosen separately: same model, matching colour first, beyond the top 15.
          for (const r of photoCandidates(c.input.title, ranked)) if (!picked.includes(r)) picked.push(r);
          const missing = [...new Set(picked.map(r => r.productId))].filter(id => !metafieldCache.has(id));
          // Small batches: each product asks for 100 metafields and 20 images (query cost limit).
          for (const ids of chunk(missing, REFERENCE_BATCH)) {
            const { nodes } = await client.graphql<{ nodes: ({ id: string; descriptionHtml?: string | null; metafields: { nodes: MetafieldValue[] }; media?: { nodes: ({ image?: RefImage | null } | null)[] } } | null)[] }>(REFERENCE_METAFIELDS, { ids });
            for (const n of nodes) if (n?.id) {
              metafieldCache.set(n.id, n.metafields.nodes);
              descriptionCache.set(n.id, n.descriptionHtml ?? '');
              imageCache.set(n.id, (n.media?.nodes ?? []).flatMap(m => (m?.image?.url ? [m.image] : [])));
            }
          }
          const refs = picked.map(r => ({ sku: r.sku, title: r.title, lead: r.lead, metafields: metafieldCache.get(r.productId) ?? [], images: imageCache.get(r.productId) ?? [], descriptionHtml: descriptionCache.get(r.productId) ?? '' }));
          const { metafields } = enrichMetafields(c.input.title, refs);
          // Photos only from the same model and colour, and only of marketing quality.
          const images = pickImages(c.input.title, refs);
          if (images) c.input.files = images.files; else c.input.tags.push('geen-afbeelding');
          imageCount.set(c.sku, images?.files.length ?? 0);
          // Description from a product of exactly the same model; without one the draft is tagged.
          const description = pickDescription(c.input.title, refs);
          if (description) { c.input.descriptionHtml = description.descriptionHtml; descriptionFrom.set(c.sku, description.sku); }
          else c.input.tags.push(NO_DESCRIPTION_TAG);
          const fromErp = new Set(c.input.metafields.map(m => `${m.namespace}.${m.key}`));
          const extra = metafields.filter(m => !fromErp.has(`${m.namespace}.${m.key}`));
          c.input.metafields.push(...extra);
          enrichedCount.set(c.sku, extra.length);
        }
        for (const c of creates) plan.changes.push({ sku: c.sku, scope: 'product', field: CREATE_FIELD, oldValue: null, newValue: `${c.input.title} — ${c.categoryFrom ? `categorie zoals ${c.categoryFrom}: ${c.input.tags.filter(t => t.startsWith('cat_')).join(', ')}` : 'geen categorie gevonden'} — ${enrichedCount.get(c.sku) ?? 0} eigenschappen ingevuld — ${imageCount.get(c.sku) ?? 0} foto's — ${descriptionFrom.has(c.sku) ? `beschrijving zoals ${descriptionFrom.get(c.sku)}` : 'geen beschrijving'}`.slice(0, 1000) });
        counts.newWithoutCategory = creates.filter(c => !c.categoryFrom).length;
      }
    }

    // Articles no longer in the ERP: tracked every run; with the setting on, their stock goes to 0
    // right away and the product is archived after 24 hours.
    const missingCurrent = plan.unmatched.shopifyOnly.map(u => state.variants.find(v => v.sku === u.sku)!).filter(Boolean);
    const { info: missingInfo, heldNow } = await trackMissing(db, missingCurrent);
    counts.notInExport = notInExport;
    counts.missingHeld = [...missingInfo.values()].filter(i => i.held).length;
    if (heldNow) counts.missingBlocked = `${heldNow} artikelen zijn binnen het uur uit het ERP verdwenen; dat is verdacht veel (maximum ${MAX_NEWLY_MISSING}). Ze worden vastgehouden: voorraad en status blijven ongewijzigd tot je ze vrijgeeft of ze terug in het ERP staan.`;
    let missingArchives: { productId: string; title: string; skus: string[] }[] = [];
    if (settings.handle_missing === true) {
      const heldProducts = new Set(missingCurrent.filter(v => missingInfo.get(v.sku)?.held === true).map(v => v.productId));
      const firstMissing = new Map([...missingInfo.entries()].map(([sku, i]) => [sku, i.since]));
      // Held SKUs, and every product with a held variant, are left alone.
      const m = planMissing({ missing: missingCurrent.filter(v => !heldProducts.has(v.productId)), all: state.variants, erpSkus: new Set(desired.map(d => d.sku)), firstMissing, now: new Date(), locations, archiveAfterHours: ARCHIVE_MISSING_AFTER_HOURS });
      plan.inventory.push(...m.inventory);
      plan.productUpdates.push(...m.archive.map(a => ({ id: a.productId, status: 'ARCHIVED' as const })));
      plan.changes.push(...m.changes);
      missingArchives = m.archive;
      counts.missingStockZeroed = m.inventory.length;
      counts.missingArchived = m.archive.length;
      counts.missingKept = m.kept;
    }
    // Always: an active product that no longer has any SKU in the ERP goes to draft, a refurbished device to
    // UNLISTED (stock 0); archiving
    // stays a manual step unless the cleanup setting above is on.
    let missingDeactivations: { productId: string; title: string; skus: string[]; status: 'DRAFT' | 'UNLISTED' }[] = [];
    if (settings.handle_missing !== true) {
      const heldProducts = new Set(missingCurrent.filter(v => missingInfo.get(v.sku)?.held === true).map(v => v.productId));
      const firstMissing = new Map([...missingInfo.entries()].map(([sku, i]) => [sku, i.since]));
      const d = planDeactivateMissing({ missing: missingCurrent.filter(v => !heldProducts.has(v.productId)), all: state.variants, erpSkus: new Set(desired.map(d => d.sku)), firstMissing, now: new Date(), locations, afterHours: DEACTIVATE_MISSING_AFTER_HOURS, maxUnlist: Math.max(0, MAX_UNLIST_PER_RUN - plan.counts.unlistedFromDraft) });
      plan.inventory.push(...d.inventory);
      plan.productUpdates.push(...d.deactivate.map(a => ({ id: a.productId, status: a.status })));
      plan.changes.push(...d.changes);
      missingDeactivations = d.deactivate;
      counts.missingDeactivated = d.deactivate.length;
      counts.unlistDeferred = plan.counts.unlistDeferred + d.unlistDeferred;
      counts.missingStockZeroed = d.inventory.length;
    }
    // Store lists from the stock after every planned write, only in the room left under max_changes by the other
    // changes and the publications of this run, so the catch-up never trips the emergency brake by itself.
    // Then every planned change is recorded.
    const planStoresAndRecord = async (publications: number) => {
      addStoreLists(plan, { current: state.variants, erpSkus: new Set(desired.map(d => d.sku)), locations, storeChangeBudget: Math.max(0, Number(settings.max_changes) - publications) });
      counts.storesDeferred = plan.counts.storesDeferred;
      counts.changes = plan.changes.length;
      const recorded = plan.changes.slice(0, MAX_RECORDED_CHANGES);
      for (const batch of chunk(recorded, 500)) {
        const { error } = await db.from('shopify_sync_changes').insert(batch.map(c => ({ run_id: runId, sku: c.sku, scope: c.scope, field: c.field, old_value: c.oldValue, new_value: c.newValue })));
        if (error) throw new Error('Wijzigingen konden niet worden vastgelegd.');
      }
      counts.recordedChanges = recorded.length;
    };

    // Every active product must be visible in the Online Store (existing ones too, also when nothing else
    // changed). Shadow mode only counts. Publications count toward the emergency brake. A failing scan or
    // publish never fails the run: it is reported in the counts.
    const managed = erpMatchedProducts(desired.map(d => d.sku), state.variants);
    // An UNLISTED refurbished device must stay reachable, also once its SKUs left the ERP (only the sync
    // makes products UNLISTED): it is published like the ERP products.
    for (const a of missingDeactivations) if (a.status === 'UNLISTED') managed.add(a.productId);
    for (const v of state.variants) if (v.status === 'UNLISTED' && isRefurbishedTitle(v.title)) managed.add(v.productId);
    const conflicted = new Set(plan.conflictedProducts);
    const ensureOnStore = async (live: boolean, exclude: Set<string>, max?: number, activating?: Set<string>) => {
      try {
        const onlyProducts = new Set([...managed].filter(id => !exclude.has(id) && !conflicted.has(id)));
        const r = await publishActiveOnOnlineStore(client, { dryRun: !live, onlyProducts, max, activating, ...(live ? { stillLive: async () => { const { data } = await db.from('shopify_sync_settings').select('mode').eq('id', true).maybeSingle(); return data?.mode === 'live'; } } : {}) });
        Object.assign(counts, publishCounts(r));
        return r;
      } catch (e) {
        counts.onlineStorePublish = `mislukt: ${(e instanceof Error ? e.message : 'onbekende fout').slice(0, 300)}`;
        return null;
      }
    };

    if (mode === 'shadow') {
      const r = await ensureOnStore(false, new Set());
      await planStoresAndRecord(r ? plannedPublications(r) : 0);
      return await finish('succeeded', counts);
    }

    // Budget against the status after this run: products about to become draft/archived are not counted,
    // products about to become active (and not yet on the Online Store) are.
    // UNLISTED counts as visible: the page must stay reachable, so it needs the Online Store too.
    const visible = (status?: string) => status === 'ACTIVE' || status === 'UNLISTED';
    const deactivating = new Set(plan.productUpdates.filter(u => u.status && !visible(u.status)).map(u => u.id));
    const activating = new Set(plan.productUpdates.filter(u => visible(u.status)).map(u => u.id));
    const preview = await ensureOnStore(false, deactivating, undefined, activating);
    const toPublish = preview ? plannedPublications(preview) : 0;
    await planStoresAndRecord(toPublish);
    if (plan.changes.length + toPublish > settings.max_changes) {
      return await finish('stopped', counts, `Noodrem: ${plan.changes.length} wijzigingen${toPublish ? ` en ${toPublish} producten in de webshop zetten` : ''} is meer dan het ingestelde maximum (${settings.max_changes}). Er is niets naar Shopify geschreven. Controleer de wijzigingen of verhoog het maximum.`);
    }

    if (plan.changes.length === 0) {
      if (toPublish) await ensureOnStore(true, new Set(), settings.max_changes);
      return await finish('succeeded', counts);
    }

    // Map Shopify ids to SKUs for error reporting.
    const skusById = new Map<string, string[]>();
    const add = (id: string, sku: string) => skusById.set(id, [...(skusById.get(id) ?? []), sku]);
    for (const v of state.variants) { add(v.productId, v.sku); add(v.variantId, v.sku); add(v.inventoryItemId, v.sku); }
    for (const c of creates) add(`new:${c.sku}`, c.sku);
    const stillLive = async () => {
      const { data, error } = await db.from('shopify_sync_settings').select('mode').eq('id', true).maybeSingle();
      return !error && data?.mode === 'live';
    };
    writing = true;
    // Archived because no longer in the ERP: logged right away like a manual archive, so the 30-day
    // delete flow applies. If logging fails the run stops (with a recovery hint) before more writes.
    const archiveById = new Map(missingArchives.map(a => [a.productId, a]));
    // The archived page gets its 301 right away (an archived product is a 404 otherwise); a redirect
    // problem is noted in the log line and never fails the run.
    let redirectScope: boolean | undefined;
    const logArchive = async (productId: string) => {
      const a = archiveById.get(productId);
      if (!a) return;
      let redirect: string | null = null;
      let note: string | null = null;
      redirectScope ??= await hasRedirectScope(client);
      if (redirectScope) {
        const product = await redirectProduct(client, productId).catch(() => null);
        const r = product ? await redirectArchived(client, product) : { redirect: null, note: 'doorverwijzing mislukt: product niet gevonden' };
        redirect = r.redirect;
        note = r.note;
        if (redirect) counts.missingRedirects = Number(counts.missingRedirects ?? 0) + 1;
      } else note = 'geen doorverwijzing: recht write_online_store_navigation ontbreekt';
      const { error } = await db.from('shopify_product_removals').insert({ product_id: a.productId, title: a.title.slice(0, 255), skus: a.skus, action: 'archive', result: 'ok', redirect, detail: `automatisch: niet meer in het ERP${note ? `; ${note}` : ''}`.slice(0, 1000), actor: 'synchronisatie' });
      if (error) throw new Error(`"${a.title}" is gearchiveerd maar kon niet in het opruimlogboek. Zet het terug als concept en archiveer het opnieuw via Alleen in Shopify.`);
    };
    // A product put on draft is a 404 as well: it gets the same 301 (Shopify ignores it again as soon as
    // the page is live). A redirect problem never fails the run.
    // An UNLISTED page stays reachable, so it gets no redirect.
    const deactivatedIds = new Set(missingDeactivations.filter(a => a.status === 'DRAFT').map(a => a.productId));
    const afterProductUpdate = async (productId: string) => {
      await logArchive(productId);
      if (!deactivatedIds.has(productId)) return;
      redirectScope ??= await hasRedirectScope(client);
      if (!redirectScope) return;
      const product = await redirectProduct(client, productId).catch(() => null);
      const r = product ? await redirectArchived(client, product) : null;
      if (r?.redirect) counts.missingRedirects = Number(counts.missingRedirects ?? 0) + 1;
    };
    const failures = await applyPlan(client, plan, runId, key, stillLive, new Map(Object.entries(locations).map(([name, id]) => [id, name])), creates, afterProductUpdate, new Map(state.variants.map(v => [v.inventoryItemId, v.productId])));
    // Failures per SKU, scope and (where known) field: a failed write must not mark successful ones as failed.
    const failed = new Map<string, { sku: string; scope: Scope; field?: string; reason: string }>();
    for (const f of failures) for (const sku of skusById.get(f.id) ?? [f.id]) failed.set([sku, f.scope, f.field ?? ''].join('\u0000'), { sku, scope: f.scope, field: f.field, reason: f.reason });

    const { error: markError } = await db.from('shopify_sync_changes').update({ applied: true }).eq('run_id', runId);
    if (markError) throw new Error('Status van de wijzigingen kon niet worden bijgewerkt.');
    for (const f of failed.values()) {
      let q = db.from('shopify_sync_changes').update({ applied: false, error: f.reason }).eq('run_id', runId).eq('sku', f.sku).eq('scope', f.scope);
      if (f.field) q = q.eq('field', f.field);
      await q;
    }
    const failedSkus = [...new Set([...failed.values()].map(f => f.sku))];
    counts.failedSkus = failedSkus.length;
    // After the writes, so products the ERP just activated are published in the same run. Products with a
    // failed write (price, stock, status…) stay hidden until a later run succeeds.
    await ensureOnStore(true, failedProducts(failures.map(f => f.id), state.variants), settings.max_changes - plan.changes.length);
    return await finish(failedSkus.length ? 'failed' : 'succeeded', counts, failedSkus.length ? `${failedSkus.length} artikel(en) konden niet worden bijgewerkt; zie de wijzigingen.` : undefined);
  } catch (error) {
    if (error instanceof StoppedByOperator) {
      return await finish('stopped', counts, 'Noodstop: de synchronisatie werd tijdens de run uitgezet of niet meer op live gezet. Er wordt niets meer geschreven; wijzigingen van vóór de stop kunnen al in Shopify staan.');
    }
    const message = error instanceof ShopifyError ? error.message : error instanceof Error ? error.message : 'Onbekende fout.';
    const note = writing ? ' Een deel van de wijzigingen kan al in Shopify staan; de volgende run vergelijkt opnieuw en corrigeert de rest.' : '';
    return await finish('failed', counts, (message + note).slice(0, 1000));
  }
}
