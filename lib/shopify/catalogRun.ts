import 'server-only';
// Generates and stores the catalogue report, and applies selected safe fixes (admin action).
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CATALOG_DESCRIPTION_SOURCE, CATALOG_PRODUCT, CATALOG_PRODUCT_UPDATE, createShopifyClient, METAFIELDS_SET, shopifyConfig, TAGS_ADD, TAGS_REMOVE, type ShopifyClient } from '@/lib/shopify/client';
import { analyseCatalog, CATALOG_BULK_QUERY, parseCatalog, type CatalogIssue, type Fix } from '@/lib/shopify/catalog';
import { CONDITION, modelOf, starsOf } from '@/lib/shopify/enrich';
import { isBlankDescription, mentionsOtherModel, SEO_SKIP_TAG, SHORT_DESCRIPTION_WORDS, wordCount } from '@/lib/shopify/seo';

type Db = typeof supabaseAdmin;
type UserError = { message: string };
const KEEP_REPORTS = 10;
export const MAX_FIXES_PER_ACTION = 200;

const clientOrThrow = (client?: ShopifyClient | null) => {
  const c = client !== undefined ? client : (() => { const cfg = shopifyConfig(); return cfg ? createShopifyClient(cfg) : null; })();
  if (!c) throw new Error('Shopify is niet gekoppeld.');
  return c;
};

/**
 * Sets the SEO texts of a product our tool manages. The TinySEO skip tag goes on first, so TinySEO's
 * nightly template never overwrites them; if the update fails, a tag we added is taken off again.
 */
async function setManagedSeo(client: ShopifyClient, id: string, tags: string[], seo: { title: string | null; description: string | null }) {
  const skipTagAdded = !tags.includes(SEO_SKIP_TAG);
  if (skipTagAdded) await editTags(client, TAGS_ADD, id, [SEO_SKIP_TAG]);
  try { await updateProduct(client, { id, seo }); }
  catch (e) { if (skipTagAdded) await editTags(client, TAGS_REMOVE, id, [SEO_SKIP_TAG]).catch(() => undefined); throw e; }
  return { skipTagAdded };
}

async function editTags(client: ShopifyClient, mutation: string, id: string, tags: string[]) {
  const r = await client.graphql<{ tagsAdd?: { userErrors: UserError[] }; tagsRemove?: { userErrors: UserError[] } }>(mutation, { id, tags });
  const errors = (r.tagsAdd ?? r.tagsRemove)?.userErrors ?? [];
  if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
}

async function updateProduct(client: ShopifyClient, product: Record<string, unknown>) {
  const { productUpdate } = await client.graphql<{ productUpdate: { userErrors: UserError[] } }>(CATALOG_PRODUCT_UPDATE, { product });
  if (productUpdate.userErrors.length) throw new Error(productUpdate.userErrors.map(e => e.message).join('; '));
}

export async function generateCatalogReport(actor: string, deps: { db?: Db; client?: ShopifyClient | null } = {}): Promise<string> {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const products = parseCatalog(await client.bulkQuery(CATALOG_BULK_QUERY));
  const { issues, counts, checked } = analyseCatalog(products);
  const { data, error } = await db.from('shopify_catalog_reports').insert({ created_by: actor, checked, counts, issues }).select('id').single();
  if (error || !data) throw new Error('Rapport kon niet worden opgeslagen.');
  const { data: old } = await db.from('shopify_catalog_reports').select('id').order('created_at', { ascending: false }).range(KEEP_REPORTS, KEEP_REPORTS + 100);
  if (old?.length) await db.from('shopify_catalog_reports').delete().in('id', old.map(r => r.id));
  return data.id as string;
}

/**
 * Applies the chosen fixes of a stored report. Every product is read again first: a fix is only
 * applied when the product title is unchanged and the problem still exists.
 */
export async function applyCatalogFixes(input: { reportId: string; productIds: string[]; kinds: Fix['kind'][]; actor: string }, deps: { db?: Db; client?: ShopifyClient | null } = {}) {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const ids = [...new Set(input.productIds)];
  if (!ids.length) throw new Error('Geen producten geselecteerd.');
  if (ids.length > MAX_FIXES_PER_ACTION) throw new Error(`Maximaal ${MAX_FIXES_PER_ACTION} producten per keer.`);
  const { data: report, error } = await db.from('shopify_catalog_reports').select('issues').eq('id', input.reportId).maybeSingle();
  if (error || !report) throw new Error('Rapport niet gevonden.');
  const byId = new Map((report.issues as CatalogIssue[]).map(i => [i.productId, i]));
  let applied = 0, skipped = 0, failed = 0;
  for (const id of ids) {
    const issue = byId.get(id);
    if (!issue) { skipped++; continue; }
    // The outcome of every product is logged before the next one is touched, so a later failure
    // never loses the record of changes that are already live in Shopify.
    const log: Record<string, unknown>[] = [];
    type Fresh = { id: string; title: string; tags: string[]; descriptionHtml: string | null; seo: { title: string | null; description: string | null } | null; condition: { value: string } | null } | null;
    let product: Fresh = null;
    let readError: string | null = null;
    try { ({ product } = await client.graphql<{ product: Fresh }>(CATALOG_PRODUCT, { id })); }
    catch (e) { readError = `product kon niet gelezen worden: ${e instanceof Error ? e.message : 'onbekende fout'}`.slice(0, 1000); }
    for (const fix of issue.fixes.filter(f => input.kinds.includes(f.kind))) {
      const base = { report_id: input.reportId, product_id: id, title: issue.title.slice(0, 255), kind: fix.kind, actor: input.actor };
      if (readError) { failed++; log.push({ ...base, result: 'failed', detail: readError }); continue; }
      let reason: string | null = null;
      if (!product) reason = 'product niet meer gevonden';
      else if (product.title !== issue.title) reason = 'titel gewijzigd sinds het rapport';
      else if (fix.kind === 'condition') {
        const stars = starsOf(product.title);
        if (!stars || CONDITION[stars] !== fix.value) reason = 'sterren in de titel komen niet meer overeen';
        else if (product.condition?.value?.trim().startsWith(`${stars}*`)) reason = 'al in orde';
      } else if (fix.kind === 'category') {
        if (product.tags.some(t => t.startsWith('cat_') && t.length > 4)) reason = 'heeft intussen al een categorie';
      } else if (fix.kind === 'seo') {
        if ((!fix.title || product.seo?.title?.trim()) && (!fix.description || product.seo?.description?.trim())) reason = 'SEO-gegevens zijn intussen al ingevuld';
      } else if (fix.kind === 'seo_replace') {
        // Only replaced when the SEO text is still exactly what the report showed.
        if ((product.seo?.title ?? '').trim() !== fix.oldTitle || (product.seo?.description ?? '').trim() !== fix.oldDescription) reason = 'SEO-tekst is sinds het rapport gewijzigd';
      } else if (!isBlankDescription(product.descriptionHtml)) reason = 'heeft al een beschrijving (die wordt nooit vervangen)';
      if (reason) { skipped++; log.push({ ...base, result: 'skipped', detail: reason }); continue; }
      try {
        if (fix.kind === 'seo' || fix.kind === 'seo_replace') {
          // 'seo' only fills an empty field; 'seo_replace' replaces both. The old texts are kept for undo.
          const old = { title: product!.seo?.title ?? null, description: product!.seo?.description ?? null };
          const title = fix.kind === 'seo' && old.title?.trim() ? old.title : fix.title;
          const description = fix.kind === 'seo' && old.description?.trim() ? old.description : fix.description;
          const { skipTagAdded } = await setManagedSeo(client, id, product!.tags, { title, description });
          log.push({ ...base, result: 'ok', detail: `SEO: titel "${title}" · beschrijving "${description}"`.slice(0, 1000),
            old_value: { ...old, skipTagAdded }, new_value: { title, description } });
        } else if (fix.kind === 'description') {
          const { product: source } = await client.graphql<{ product: { id: string; title: string; descriptionHtml: string | null } | null }>(CATALOG_DESCRIPTION_SOURCE, { id: fix.fromProductId });
          // The source must still be the same model, with a substantial text that names no other model.
          if (!source || modelOf(source.title) !== modelOf(product!.title) || wordCount(source.descriptionHtml) < SHORT_DESCRIPTION_WORDS || mentionsOtherModel(product!.title, source.descriptionHtml)) {
            skipped++; log.push({ ...base, result: 'skipped', detail: 'bronproduct is niet meer geschikt' }); continue;
          }
          await updateProduct(client, { id, descriptionHtml: source.descriptionHtml });
          log.push({ ...base, result: 'ok', detail: `beschrijving overgenomen van "${source.title}"`.slice(0, 1000) });
        } else if (fix.kind === 'condition') {
          const { metafieldsSet } = await client.graphql<{ metafieldsSet: { userErrors: UserError[] } }>(METAFIELDS_SET, { metafields: [{ ownerId: id, namespace: 'magento', key: 'conditie', type: 'single_line_text_field', value: fix.value }] });
          if (metafieldsSet.userErrors.length) throw new Error(metafieldsSet.userErrors.map(e => e.message).join('; '));
          log.push({ ...base, result: 'ok', detail: `Uiterlijk = ${fix.value}` });
        } else {
          const { tagsAdd } = await client.graphql<{ tagsAdd: { userErrors: UserError[] } }>(TAGS_ADD, { id, tags: fix.tags });
          if (tagsAdd.userErrors.length) throw new Error(tagsAdd.userErrors.map(e => e.message).join('; '));
          if (fix.removeEmptyTag) {
            const { tagsRemove } = await client.graphql<{ tagsRemove: { userErrors: UserError[] } }>(TAGS_REMOVE, { id, tags: ['cat_'] });
            if (tagsRemove.userErrors.length) throw new Error(tagsRemove.userErrors.map(e => e.message).join('; '));
          }
          log.push({ ...base, result: 'ok', detail: `tags ${fix.tags.join(', ')} (zoals ${fix.fromSku})`.slice(0, 1000) });
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
  return { applied, skipped, failed };
}

/**
 * Undoes an applied SEO fix: the old SEO texts come back and a skip tag we added is removed, so
 * TinySEO manages the product again. Only when the texts are still what the fix set; each fix once.
 */
export async function revertCatalogFix(input: { fixId: number; actor: string }, deps: { db?: Db; client?: ShopifyClient | null } = {}): Promise<{ ok: boolean; detail: string; status: 'ok' | 'skipped' | 'failed' }> {
  const db = deps.db ?? supabaseAdmin;
  const client = clientOrThrow(deps.client);
  const { data: fix, error } = await db.from('shopify_catalog_fixes').select('id,report_id,product_id,title,kind,result,old_value,new_value').eq('id', input.fixId).maybeSingle();
  if (error || !fix) throw new Error('Aanpassing niet gevonden.');
  if (!['seo', 'seo_replace'].includes(fix.kind) || fix.result !== 'ok' || !fix.old_value || !fix.new_value) throw new Error('Deze aanpassing kan niet worden teruggedraaid.');
  const { data: done } = await db.from('shopify_catalog_fixes').select('id').eq('reverts', fix.id).eq('result', 'ok').limit(1);
  if (done?.length) throw new Error('Deze aanpassing is al teruggedraaid.');
  const old = fix.old_value as { title: string | null; description: string | null; skipTagAdded?: boolean };
  const set = fix.new_value as { title: string | null; description: string | null };
  const { product } = await client.graphql<{ product: { id: string; tags: string[]; seo: { title: string | null; description: string | null } | null } | null }>(CATALOG_PRODUCT, { id: fix.product_id });
  const base = { report_id: fix.report_id, product_id: fix.product_id, title: String(fix.title ?? '').slice(0, 255), kind: 'revert', actor: input.actor, reverts: fix.id };
  const same = (a: { title: string | null; description: string | null }) => (product?.seo?.title ?? '') === (a.title ?? '') && (product?.seo?.description ?? '') === (a.description ?? '');
  let result: { ok: boolean; detail: string; status: 'ok' | 'skipped' | 'failed' };
  if (!product) result = { ok: false, status: 'skipped', detail: 'product niet meer gevonden' };
  // Already restored by an earlier attempt whose tag removal failed: only the tag is left to do.
  else if (!same(set) && !same(old)) result = { ok: false, status: 'skipped', detail: 'SEO-tekst is intussen opnieuw gewijzigd; niet teruggezet' };
  else {
    try {
      if (same(set)) await updateProduct(client, { id: fix.product_id, seo: { title: old.title ?? '', description: old.description ?? '' } });
      if (old.skipTagAdded && product.tags.includes(SEO_SKIP_TAG)) await editTags(client, TAGS_REMOVE, fix.product_id, [SEO_SKIP_TAG]);
      result = { ok: true, status: 'ok', detail: `teruggezet${old.skipTagAdded ? '; TinySEO beheert dit product weer' : ''}` };
    } catch (e) {
      // Partly done (text restored, tag still on) stays retryable: a failed row never blocks a later undo.
      result = { ok: false, status: 'failed', detail: `terugdraaien niet volledig: ${e instanceof Error ? e.message : 'onbekende fout'}; probeer opnieuw`.slice(0, 1000) };
    }
  }
  const { error: logError } = await db.from('shopify_catalog_fixes').insert({ ...base, result: result.status, detail: result.detail,
    old_value: result.ok ? set : null, new_value: result.ok ? { title: old.title, description: old.description } : null });
  if (logError) throw new Error(result.ok ? 'Teruggezet, maar het logboek kon niet worden bijgewerkt.' : 'Logboek kon niet worden bijgewerkt.');
  return result;
}
