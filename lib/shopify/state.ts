// Reads the current Shopify catalogue state from a bulk-operation JSONL export (pure parsing).
import { parseMoneyCents, SYNCED_METAFIELDS, metafieldId, type CurrentState, type ProductStatus } from '@/lib/shopify/plan';

const alias = (m: { namespace: string; key: string }) => `mf_${m.namespace}_${m.key}`;

/** Bulk query: every variant with its product fields, synced metafields and inventory per location. */
export const BULK_VARIANTS_QUERY = `{
  productVariants {
    edges {
      node {
        id
        sku
        price
        compareAtPrice
        taxable
        inventoryItem {
          id
          inventoryLevels {
            edges {
              node {
                location { id name }
                quantities(names: ["available"]) { name quantity }
              }
            }
          }
        }
        product {
          id
          title
          vendor
          productType
          status
${SYNCED_METAFIELDS.map(m => `          ${alias(m)}: metafield(namespace: "${m.namespace}", key: "${m.key}") { value }`).join('\n')}
        }
      }
    }
  }
}`;

type VariantLine = {
  id: string; sku: string | null; price: string; compareAtPrice: string | null; taxable: boolean;
  inventoryItem: { id: string } | null;
  product: Record<string, unknown> & { id: string; title: string; vendor: string; productType: string; status: ProductStatus };
};
type LevelLine = { __parentId: string; location: { id: string; name: string }; quantities: { name: string; quantity: number }[] };

/**
 * Parses the JSONL file. Inventory levels are separate lines that point to their variant with
 * __parentId (Shopify's flat bulk format). Returns the variants and the locations seen.
 */
export function parseBulkVariants(jsonl: string): { variants: CurrentState[]; locations: Record<string, string> } {
  const variants = new Map<string, CurrentState>();
  const locations: Record<string, string> = {};
  const pendingLevels: LevelLine[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as VariantLine | LevelLine;
    if ('__parentId' in row) { pendingLevels.push(row); continue; }
    const v = row as VariantLine;
    if (!v.inventoryItem?.id || !v.product?.id) continue;
    const metafields: Record<string, string | null> = {};
    for (const m of SYNCED_METAFIELDS) {
      const value = (v.product[alias(m)] as { value?: string } | null | undefined)?.value;
      metafields[metafieldId(m)] = value ?? null;
    }
    variants.set(v.id, {
      sku: (v.sku ?? '').trim(),
      productId: v.product.id,
      variantId: v.id,
      inventoryItemId: v.inventoryItem.id,
      title: v.product.title ?? '',
      vendor: v.product.vendor ?? '',
      productType: v.product.productType ?? '',
      status: v.product.status,
      priceCents: parseMoneyCents(v.price) ?? 0,
      compareAtCents: parseMoneyCents(v.compareAtPrice),
      taxable: v.taxable === true,
      inventory: {},
      metafields,
    });
  }
  for (const level of pendingLevels) {
    const variant = variants.get(level.__parentId);
    if (!variant || !level.location?.name) continue;
    locations[level.location.name] = level.location.id;
    const available = level.quantities?.find(q => q.name === 'available');
    variant.inventory[level.location.name] = available?.quantity ?? 0;
  }
  return { variants: [...variants.values()], locations };
}
