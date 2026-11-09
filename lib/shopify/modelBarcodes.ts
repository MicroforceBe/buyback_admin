// Model GTINs as Shopify barcodes. The ERP has no EAN for refurbished devices, so the GTIN of the model
// (marketing → Modellen & GTIN) is written into the barcode of refurbished variants. The theme's product
// JSON-LD reads the barcode, and so does every feed. Rules (Olivier, 2026-11):
// - only a variant WITHOUT a barcode is filled; an existing barcode is never overwritten;
// - the code the tool wrote is remembered in a variant metafield, so only that code can later be corrected
//   (model GTIN changed) or removed (model GTIN withdrawn); a barcode someone typed is never touched;
// - the ERP sync only sets a barcode when it creates a product, so it does not undo this.
import { VARIANTS_UPDATE, type ShopifyClient } from '@/lib/shopify/client';
import { gtinsByModel, modelKey, validGtin } from '@/lib/marketing/merchantFeed';

export const MARKER = { namespace: 'microforce', key: 'model_gtin', type: 'single_line_text_field' } as const;
/** At most this many variants are written per run; the rest follow in the next run. */
export const MAX_BARCODE_WRITES = 200;
const MAX_PAGES = 100;

export const BARCODE_PRODUCTS = `query ModelBarcodeProducts($after: String) {
  products(first: 50, after: $after, query: "-status:archived") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title status
      refurbished: metafield(namespace: "custom", key: "refurbished_product") { value }
      variants(first: 20) { nodes { id title sku barcodes(first: 3) { nodes { value } } marker: metafield(namespace: "${MARKER.namespace}", key: "${MARKER.key}") { value } } }
    }
  }
}`;

export type BarcodeVariant = { id: string; title: string | null; sku: string | null; barcodes: { nodes: { value: string }[] }; marker: { value: string } | null };
export type BarcodeProduct = { id: string; title: string; status: string; refurbished: { value: string } | null; variants: { nodes: BarcodeVariant[] } };
export type BarcodeChange = { productId: string; variantId: string; sku: string; title: string; action: 'fill' | 'fix' | 'clear'; from: string | null; to: string | null };

/**
 * Which refurbished variants get, change or lose the model GTIN as barcode. `gtins` maps the (current)
 * model key to its GTIN. Only a variant without its own configuration counts ("256GB / Blue" is not the
 * model in the title), the same rule as the Google feed.
 */
export function planModelBarcodes(products: BarcodeProduct[], gtins: Map<string, string>): BarcodeChange[] {
  const changes: BarcodeChange[] = [];
  for (const p of products) {
    if (p.status === 'ARCHIVED' || p.refurbished?.value !== 'true') continue;
    const target = validGtin(gtins.get(modelKey(p.title)));
    for (const v of p.variants.nodes) {
      if (v.title && v.title !== 'Default Title') continue;
      const codes = v.barcodes.nodes.map(b => (b.value ?? '').trim()).filter(Boolean);
      const marker = (v.marker?.value ?? '').trim();
      const base = { productId: p.id, variantId: v.id, sku: v.sku ?? '', title: p.title };
      if (!codes.length) {
        if (target) changes.push({ ...base, action: 'fill', from: null, to: target });
      } else if (codes.length === 1 && marker && codes[0] === marker && target !== marker) {
        // Our own code, and the model's GTIN changed or was withdrawn.
        changes.push({ ...base, action: target ? 'fix' : 'clear', from: marker, to: target });
      }
    }
  }
  return changes;
}

export type BarcodeResult =
  | { status: 'skipped'; reason: string }
  | { status: 'done'; dryRun: boolean; candidates: number; filled: number; fixed: number; cleared: number; failed: { sku: string; reason: string }[]; remaining: number };

/** Reads the model GTIN table whole (small); an empty table stops the run, so nothing is cleared by mistake. */
export async function loadModelGtins(db: { from: (t: string) => any }): Promise<Map<string, string>> {
  const rows: { model_key: string; gtin: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('model_gtins').select('model_key,gtin').order('model_key', { ascending: true }).range(from, from + 999);
    if (error) throw new Error('GTIN-tabel kon niet worden geladen.');
    for (const r of data ?? []) rows.push({ model_key: String(r.model_key), gtin: String(r.gtin) });
    if (!data || data.length < 1000) break;
  }
  return new Map([...gtinsByModel(rows)].map(([k, r]) => [k, r.gtin]));
}

/** Scans every non-archived product and (unless dryRun) writes at most `max` barcodes. Never throws on a single product. */
export async function syncModelBarcodes(client: ShopifyClient, gtins: Map<string, string>, opts: { dryRun: boolean; max?: number }): Promise<BarcodeResult> {
  if (!gtins.size) return { status: 'skipped', reason: 'geen GTIN\'s in de tabel' };
  const products: BarcodeProduct[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: BarcodeProduct[] } } = await client.graphql(BARCODE_PRODUCTS, { after });
    products.push(...r.products.nodes);
    if (!r.products.pageInfo.hasNextPage || !r.products.pageInfo.endCursor || r.products.pageInfo.endCursor === after) break;
    after = r.products.pageInfo.endCursor;
  }
  const changes = planModelBarcodes(products, gtins);
  const max = Math.max(0, opts.max ?? MAX_BARCODE_WRITES);
  const count = (list: BarcodeChange[]) => ({ filled: list.filter(c => c.action === 'fill').length, fixed: list.filter(c => c.action === 'fix').length, cleared: list.filter(c => c.action === 'clear').length });
  if (opts.dryRun) return { status: 'done', dryRun: true, candidates: changes.length, ...count(changes), failed: [], remaining: changes.length };

  const todo = changes.slice(0, max);
  const byProduct = new Map<string, BarcodeChange[]>();
  for (const c of todo) byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c]);
  const done: BarcodeChange[] = [];
  const failed: { sku: string; reason: string }[] = [];
  for (const [productId, list] of byProduct) {
    try {
      const variants = list.map(c => ({
        id: c.variantId,
        barcodes: c.to ? [{ value: c.to }] : [],
        ...(c.to ? { metafields: [{ ...MARKER, value: c.to }] } : {}),
      }));
      const r = await client.graphql<{ productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(VARIANTS_UPDATE, { productId, variants });
      const errors = r.productVariantsBulkUpdate?.userErrors ?? [];
      if (errors.length) throw new Error(errors.map(e => e.message).join('; '));
      done.push(...list);
    } catch (e) {
      for (const c of list) failed.push({ sku: c.sku, reason: (e instanceof Error ? e.message : 'onbekende fout').slice(0, 200) });
    }
  }
  return { status: 'done', dryRun: false, candidates: changes.length, ...count(done), failed: failed.slice(0, 20), remaining: changes.length - done.length };
}
