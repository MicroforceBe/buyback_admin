import 'server-only';
// Generates and stores the collection SEO report, applies selected safe fixes and undoes them (admin actions).
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { COLLECTION_INFO, COLLECTION_UPDATE, createShopifyClient, METAFIELDS_DELETE, METAFIELDS_SET, shopifyConfig, type ShopifyClient } from '@/lib/shopify/client';
import { analyseCollections, COLLECTIONS_BULK_QUERY, parseCollections, type CollectionFix, type CollectionIssue } from '@/lib/shopify/collections';
import { applyClean, cleanUndoHtml } from '@/lib/shopify/textClean';
import { demoteH1, DEMOTED_H1_ATTR, emptyImageCount, hasH1, namePlaceholderCount, restoreH1, scriptCount } from '@/lib/shopify/seo';

type Db = typeof supabaseAdmin;
type UserError = { message: string };
type Fresh = { id: string; title: string; descriptionHtml: string | null; seo: { title: string | null; description: string | null } | null; hidden: { value: string } | null } | null;
const KEEP_REPORTS = 10;
export const MAX_COLLECTION_FIXES = 200;

const clientOrThrow = (client?: ShopifyClient | null) => {
  const c = client !== undefined ? client : (() => { const cfg = shopifyConfig(); return cfg ? createShopifyClient(cfg) : null; })();
  if (!c) throw new Error('Shopify is niet gekoppeld.');
  return c;
};

const errorsOf = (payload: { userErrors: UserError[] }) => { if (payload.userErrors.length) throw new Error(payload.userErrors.map(e => e.message).join('; ')); };
async function updateCollection(client: ShopifyClient, collection: Record<string, unknown>) {
  const { collectionUpdate } = await client.graphql<{ collectionUpdate: { userErrors: UserError[] } }>(COLLECTION_UPDATE, { collection });
  errorsOf(collectionUpdate);
}
async function setHidden(client: ShopifyClient, id: string) {
  const { metafieldsSet } = await client.graphql<{ metafieldsSet: { userErrors: UserError[] } }>(METAFIELDS_SET, { metafields: [{ ownerId: id, namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' }] });
  errorsOf(metafieldsSet);
}
async function clearHidden(client: ShopifyClient, id: string) {
  const { metafieldsDelete } = await client.graphql<{ metafieldsDelete: { userErrors: UserError[] } }>(METAFIELDS_DELETE, { metafields: [{ ownerId: id, namespace: 'seo', key: 'hidden' }] });
  errorsOf(metafieldsDelete);
}

export async function generateCollectionReport(actor: string, deps: { db?: Db; client?: ShopifyClient | null } = {}): Promise<string> {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const { issues, counts, checked } = analyseCollections(parseCollections(await client.bulkQuery(COLLECTIONS_BULK_QUERY)));
  const { data, error } = await db.from('shopify_catalog_reports').insert({ scope: 'collections', created_by: actor, checked, counts, issues }).select('id').single();
  if (error || !data) throw new Error('Rapport kon niet worden opgeslagen.');
  const { data: old } = await db.from('shopify_catalog_reports').select('id').eq('scope', 'collections').order('created_at', { ascending: false }).range(KEEP_REPORTS, KEEP_REPORTS + 100);
  if (old?.length) await db.from('shopify_catalog_reports').delete().in('id', old.map(r => r.id));
  return data.id as string;
}

/**
 * Applies the chosen fixes of a stored collection report. Each collection is read again first; a fix is
 * only applied when the title is unchanged and the problem still exists. Every outcome is logged.
 */
export async function applyCollectionFixes(input: { reportId: string; collectionIds: string[]; kinds: CollectionFix['kind'][]; actor: string }, deps: { db?: Db; client?: ShopifyClient | null } = {}) {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const ids = [...new Set(input.collectionIds)];
  if (!ids.length) throw new Error('Geen collecties geselecteerd.');
  if (ids.length > MAX_COLLECTION_FIXES) throw new Error(`Maximaal ${MAX_COLLECTION_FIXES} collecties per keer.`);
  const { data: report, error } = await db.from('shopify_catalog_reports').select('issues').eq('id', input.reportId).eq('scope', 'collections').maybeSingle();
  if (error || !report) throw new Error('Rapport niet gevonden.');
  const byId = new Map((report.issues as CollectionIssue[]).map(i => [i.collectionId, i]));
  let applied = 0, skipped = 0, failed = 0, noMatch = 0;
  for (const id of ids) {
    const issue = byId.get(id);
    if (!issue || !issue.fixes.some(f => input.kinds.includes(f.kind))) { noMatch++; continue; }
    const log: Record<string, unknown>[] = [];
    let col: Fresh = null;
    let readError: string | null = null;
    try { ({ collection: col } = await client.graphql<{ collection: Fresh }>(COLLECTION_INFO, { id })); }
    catch (e) { readError = `collectie kon niet gelezen worden: ${e instanceof Error ? e.message : 'onbekende fout'}`.slice(0, 1000); }
    for (const fix of issue.fixes.filter(f => input.kinds.includes(f.kind))) {
      const base = { report_id: input.reportId, product_id: id, title: issue.title.slice(0, 255), kind: fix.kind, actor: input.actor };
      if (readError) { failed++; log.push({ ...base, result: 'failed', detail: readError }); continue; }
      let reason: string | null = null;
      if (!col) reason = 'collectie niet meer gevonden';
      else if (col.title !== issue.title) reason = 'titel gewijzigd sinds het rapport';
      else if (fix.kind === 'col_seo') { if ((!fix.title || col.seo?.title?.trim()) && (!fix.description || col.seo?.description?.trim())) reason = 'SEO-gegevens zijn intussen al ingevuld'; }
      else if (fix.kind === 'col_hide') { if (col.hidden?.value === '1') reason = 'is al verborgen'; }
      else if (fix.kind === 'col_clean') { if (!scriptCount(col.descriptionHtml) && !namePlaceholderCount(col.descriptionHtml) && !emptyImageCount(col.descriptionHtml)) reason = 'al opgeschoond'; }
      else if (!hasH1(col.descriptionHtml)) reason = 'tekst heeft geen H1-kop meer';
      if (reason) { skipped++; log.push({ ...base, result: 'skipped', detail: reason }); continue; }
      try {
        if (fix.kind === 'col_seo') {
          // Only empty fields are filled; existing SEO texts are never overwritten. The old texts are kept for undo.
          const old = { title: col!.seo?.title ?? null, description: col!.seo?.description ?? null };
          const title = old.title?.trim() ? old.title : fix.title;
          const description = old.description?.trim() ? old.description : fix.description;
          await updateCollection(client, { id, seo: { title, description } });
          log.push({ ...base, result: 'ok', detail: `SEO: titel "${title}" · beschrijving "${description}"`.slice(0, 1000), old_value: old, new_value: { title, description } });
        } else if (fix.kind === 'col_hide') {
          await setHidden(client, id);
          log.push({ ...base, result: 'ok', detail: 'verborgen voor zoekmachines (seo.hidden = 1)', old_value: { hidden: false }, new_value: { hidden: true } });
        } else if (fix.kind === 'col_clean') {
          const out = await applyClean(col!.descriptionHtml ?? '', html => updateCollection(client, { id, descriptionHtml: html }), async () => {
            const { collection: after } = await client.graphql<{ collection: Fresh }>(COLLECTION_INFO, { id });
            return after?.descriptionHtml ?? null;
          });
          if (!out.done) { skipped++; log.push({ ...base, result: 'skipped', detail: out.reason }); continue; }
          col = { ...col!, descriptionHtml: out.html };
          log.push({ ...base, result: 'ok', detail: out.detail.slice(0, 1000), old_value: out.old_value, new_value: out.new_value });
        } else {
          const token = randomUUID().slice(0, 12);
          const { html, count } = demoteH1(col!.descriptionHtml ?? '', token);
          await updateCollection(client, { id, descriptionHtml: html });
          col = { ...col!, descriptionHtml: html };
          log.push({ ...base, result: 'ok', detail: `${count} H1-kop${count === 1 ? '' : 'pen'} in de tekst → H2`, old_value: { headings: count, token }, new_value: { headings: count, token } });
        }
        applied++;
      } catch (e) {
        failed++;
        log.push({ ...base, result: 'failed', detail: (e instanceof Error ? e.message : 'onbekende fout').slice(0, 1000) });
      }
    }
    if (log.length) {
      const { error: logError } = await db.from('shopify_catalog_fixes').insert(log);
      if (logError) throw new Error(`${applied} aanpassingen zijn uitgevoerd, maar het logboek kon niet worden bijgewerkt; gestopt.`);
    }
  }
  return { applied, skipped, failed, noMatch };
}

/** Undoes one applied collection fix, only when the collection still shows what the fix set. Once per fix. */
export async function revertCollectionFix(input: { fixId: number; actor: string }, deps: { db?: Db; client?: ShopifyClient | null } = {}): Promise<{ ok: boolean; detail: string; status: 'ok' | 'skipped' | 'failed' }> {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const { data: fix, error } = await db.from('shopify_catalog_fixes').select('id,report_id,product_id,title,kind,result,old_value,new_value').eq('id', input.fixId).maybeSingle();
  if (error || !fix) throw new Error('Aanpassing niet gevonden.');
  if (!['col_seo', 'col_hide', 'col_heading', 'col_clean'].includes(fix.kind) || fix.result !== 'ok' || !fix.old_value || !fix.new_value) throw new Error('Deze aanpassing kan niet worden teruggedraaid.');
  const { data: done } = await db.from('shopify_catalog_fixes').select('id').eq('reverts', fix.id).eq('result', 'ok').limit(1);
  if (done?.length) throw new Error('Deze aanpassing is al teruggedraaid.');
  const { collection: col } = await client.graphql<{ collection: Fresh }>(COLLECTION_INFO, { id: fix.product_id });
  const base = { report_id: fix.report_id, product_id: fix.product_id, title: String(fix.title ?? '').slice(0, 255), kind: 'revert', actor: input.actor, reverts: fix.id };
  let result: { ok: boolean; detail: string; status: 'ok' | 'skipped' | 'failed' };
  try {
    if (!col) result = { ok: false, status: 'skipped', detail: 'collectie niet meer gevonden' };
    else if (fix.kind === 'col_seo') {
      const set = fix.new_value as { title: string | null; description: string | null };
      const old = fix.old_value as { title: string | null; description: string | null };
      const now = { title: col.seo?.title ?? '', description: col.seo?.description ?? '' };
      if (now.title !== (set.title ?? '') || now.description !== (set.description ?? '')) result = { ok: false, status: 'skipped', detail: 'SEO-tekst is intussen opnieuw gewijzigd; niet teruggezet' };
      else { await updateCollection(client, { id: fix.product_id, seo: { title: old.title ?? '', description: old.description ?? '' } }); result = { ok: true, status: 'ok', detail: 'SEO-tekst teruggezet' }; }
    } else if (fix.kind === 'col_hide') {
      if (col.hidden?.value !== '1') result = { ok: false, status: 'skipped', detail: 'collectie is al zichtbaar' };
      else { await clearHidden(client, fix.product_id); result = { ok: true, status: 'ok', detail: 'weer zichtbaar voor zoekmachines' }; }
    } else if (fix.kind === 'col_clean') {
      const undo = cleanUndoHtml(col.descriptionHtml ?? '', fix.old_value as { edits?: [] }, fix.new_value as { hash?: string });
      if ('reason' in undo) result = { ok: false, status: 'skipped', detail: undo.reason };
      else { await updateCollection(client, { id: fix.product_id, descriptionHtml: undo.html }); result = { ok: true, status: 'ok', detail: 'oorspronkelijke tekst teruggezet' }; }
    } else {
      const restored = restoreH1(col.descriptionHtml ?? '', String((fix.old_value as { token?: string }).token ?? ''));
      if (!restored.count) result = { ok: false, status: 'skipped', detail: `geen gemarkeerde kop (${DEMOTED_H1_ATTR}) meer gevonden; tekst is intussen gewijzigd` };
      else { await updateCollection(client, { id: fix.product_id, descriptionHtml: restored.html }); result = { ok: true, status: 'ok', detail: `${restored.count} kop${restored.count === 1 ? '' : 'pen'} terug naar H1` }; }
    }
  } catch (e) {
    result = { ok: false, status: 'failed', detail: `terugdraaien mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`.slice(0, 1000) };
  }
  const { error: logError } = await db.from('shopify_catalog_fixes').insert({ ...base, result: result.status, detail: result.detail, old_value: null, new_value: null });
  if (logError) throw new Error(result.ok ? 'Teruggezet, maar het logboek kon niet worden bijgewerkt.' : 'Logboek kon niet worden bijgewerkt.');
  return result;
}
