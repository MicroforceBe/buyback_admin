import 'server-only';
// One Shopify sync run: ERP CSV rows -> desired state -> compare with Shopify -> record changes,
// and in live mode write them in batches. Modes: off (nothing), shadow (record only), live (write).
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createShopifyClient, shopifyConfig, ShopifyError, INVENTORY_SET, METAFIELDS_SET, PRODUCT_UPDATE, VARIANTS_UPDATE, type ShopifyClient } from '@/lib/shopify/client';
import { BULK_VARIANTS_QUERY, parseBulkVariants } from '@/lib/shopify/state';
import { chunk, desiredFromRow, planSync, type DesiredState, type Plan } from '@/lib/shopify/plan';

export type SyncMode = 'off' | 'shadow' | 'live';
export type SyncResult =
  | { status: 'skipped'; reason: 'off' | 'running' | 'not_configured' }
  | { status: 'succeeded' | 'failed' | 'stopped'; runId: string; mode: Exclude<SyncMode, 'off'>; counts: Record<string, unknown>; error?: string };

const MAX_RECORDED_CHANGES = 5000;
const MAX_UNMATCHED = 2000;
const STALE_RUN_MINUTES = 10; // maxDuration is 5 minutes
const KEEP_RUNS_DAYS = 30;

type Db = typeof supabaseAdmin;
type Deps = { db?: Db; client?: ShopifyClient | null; idempotencyKey?: () => string };

type UserError = { field?: string[] | null; message: string };
const errorText = (errors: UserError[]) => errors.map(e => e.message).join('; ').slice(0, 900);

async function loadDesired(db: Db): Promise<{ desired: DesiredState[]; invalid: number }> {
  const desired: DesiredState[] = [];
  let invalid = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('erp_articles').select('sku,raw_erp_row').eq('missing_from_erp', false).order('sku').range(from, from + 999);
    if (error) throw new Error('ERP-artikelen konden niet worden geladen.');
    for (const row of data ?? []) {
      const d = row.raw_erp_row && typeof row.raw_erp_row === 'object' ? desiredFromRow(row.raw_erp_row as Record<string, unknown>) : null;
      if (d && d.sku === row.sku) desired.push(d); else invalid++;
    }
    if (!data || data.length < 1000) break;
  }
  return { desired, invalid };
}

/** Writes the plan to Shopify in batches. Returns the Shopify ids (product, variant, inventory item or owner) whose write failed, with the reason. */
async function applyPlan(client: ShopifyClient, plan: Plan, runId: string, key: () => string): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  for (const update of plan.productUpdates) {
    const { productUpdate } = await client.graphql<{ productUpdate: { userErrors: UserError[] } }>(PRODUCT_UPDATE, { product: update });
    if (productUpdate.userErrors.length) failed.set(update.id, errorText(productUpdate.userErrors));
  }
  for (const group of plan.variantUpdates) {
    const { productVariantsBulkUpdate } = await client.graphql<{ productVariantsBulkUpdate: { userErrors: UserError[] } }>(VARIANTS_UPDATE, group);
    if (productVariantsBulkUpdate.userErrors.length) for (const v of group.variants) failed.set(v.id, errorText(productVariantsBulkUpdate.userErrors));
  }
  for (const batch of chunk(plan.inventory, 100)) {
    const { inventorySetQuantities } = await client.graphql<{ inventorySetQuantities: { userErrors: UserError[] } }>(INVENTORY_SET, {
      input: { name: 'available', reason: 'correction', referenceDocumentUri: `microforce://erp-sync/${runId}`, quantities: batch.map(q => ({ ...q, changeFromQuantity: null })) },
      key: key(),
    });
    if (inventorySetQuantities.userErrors.length) for (const q of batch) failed.set(q.inventoryItemId, errorText(inventorySetQuantities.userErrors));
  }
  for (const batch of chunk(plan.metafields, 25)) {
    const { metafieldsSet } = await client.graphql<{ metafieldsSet: { userErrors: UserError[] } }>(METAFIELDS_SET, { metafields: batch });
    if (metafieldsSet.userErrors.length) for (const m of batch) failed.set(m.ownerId, errorText(metafieldsSet.userErrors));
  }
  return failed;
}

/**
 * Runs one sync. Safe to call from cron and from the admin page: a second concurrent run is
 * refused by the database, and nothing is written to Shopify unless the mode is 'live'.
 */
export async function runShopifySync(input: { trigger: 'cron' | 'manual'; actor: string }, deps: Deps = {}): Promise<SyncResult> {
  const db = deps.db ?? supabaseAdmin;
  const key = deps.idempotencyKey ?? randomUUID;

  const { data: settings, error: settingsError } = await db.from('shopify_sync_settings').select('mode,max_changes').eq('id', true).maybeSingle();
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
    return { status, runId, mode, counts, ...(error ? { error } : {}) };
  };

  const counts: Record<string, unknown> = {};
  let writing = false;
  try {
    const { desired, invalid } = await loadDesired(db);
    const [jsonl, apiLocations] = await Promise.all([client.bulkQuery(BULK_VARIANTS_QUERY), client.locations()]);
    const state = parseBulkVariants(jsonl);
    const plan = planSync({ desired, current: state.variants, locations: { ...state.locations, ...apiLocations }, invalidRows: invalid });
    // Lists (capped) of SKUs that are not synced, so the admin page can show and filter them.
    const cap = (list: Plan['unmatched']['erpOnly']) => list.slice(0, MAX_UNMATCHED).map(u => ({ sku: u.sku, title: u.title.slice(0, 200), ...(u.productId ? { productId: u.productId } : {}) }));
    Object.assign(counts, plan.counts, {
      changes: plan.changes.length, shopifyVariants: state.variants.length,
      erpOnlySkus: cap(plan.unmatched.erpOnly), shopifyOnlySkus: cap(plan.unmatched.shopifyOnly), duplicateSkuList: cap(plan.unmatched.duplicate),
    });

    const recorded = plan.changes.slice(0, MAX_RECORDED_CHANGES);
    for (const batch of chunk(recorded, 500)) {
      const { error } = await db.from('shopify_sync_changes').insert(batch.map(c => ({ run_id: runId, sku: c.sku, scope: c.scope, field: c.field, old_value: c.oldValue, new_value: c.newValue })));
      if (error) throw new Error('Wijzigingen konden niet worden vastgelegd.');
    }
    counts.recordedChanges = recorded.length;

    if (mode === 'shadow' || plan.changes.length === 0) return await finish('succeeded', counts);

    if (plan.changes.length > settings.max_changes) {
      return await finish('stopped', counts, `Noodrem: ${plan.changes.length} wijzigingen is meer dan het ingestelde maximum (${settings.max_changes}). Er is niets naar Shopify geschreven. Controleer de wijzigingen of verhoog het maximum.`);
    }

    // Map Shopify ids to SKUs for error reporting.
    const skusById = new Map<string, string[]>();
    const add = (id: string, sku: string) => skusById.set(id, [...(skusById.get(id) ?? []), sku]);
    for (const v of state.variants) { add(v.productId, v.sku); add(v.variantId, v.sku); add(v.inventoryItemId, v.sku); }
    writing = true;
    const failedById = await applyPlan(client, plan, runId, key);
    const failed = new Map<string, string>();
    for (const [id, reason] of failedById) for (const sku of skusById.get(id) ?? [id]) failed.set(sku, reason);

    const failedSkus = [...failed.keys()];
    const { error: markError } = await db.from('shopify_sync_changes').update({ applied: true }).eq('run_id', runId);
    if (markError) throw new Error('Status van de wijzigingen kon niet worden bijgewerkt.');
    for (const [sku, reason] of failed) await db.from('shopify_sync_changes').update({ applied: false, error: reason }).eq('run_id', runId).eq('sku', sku);
    counts.failedSkus = failedSkus.length;
    return await finish(failedSkus.length ? 'failed' : 'succeeded', counts, failedSkus.length ? `${failedSkus.length} artikel(en) konden niet worden bijgewerkt; zie de wijzigingen.` : undefined);
  } catch (error) {
    const message = error instanceof ShopifyError ? error.message : error instanceof Error ? error.message : 'Onbekende fout.';
    const note = writing ? ' Een deel van de wijzigingen kan al in Shopify staan; de volgende run vergelijkt opnieuw en corrigeert de rest.' : '';
    return await finish('failed', counts, (message + note).slice(0, 1000));
  }
}
