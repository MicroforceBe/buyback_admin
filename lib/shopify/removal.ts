// Archiving and deleting Shopify products that no longer exist in the ERP: pure eligibility rules.
// A product is only eligible when none of its variant SKUs is in the latest ERP import, so a product
// that still carries one ERP article is never touched.

export type RemovalAction = 'archive' | 'restore' | 'delete';

export type ShopifyProductInfo = {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  /** Sum of the positive available quantities over all variants and locations (negatives never offset). */
  positiveStock: number;
  skus: string[];
  /** False when Shopify returned only part of the variants: the product is then never touched. */
  allVariantsChecked: boolean;
  collectionHandle: string | null;
};

export const MAX_PER_ACTION = 100;
export const DELETE_AFTER_DAYS = 30;

export function checkRemoval(input: {
  action: RemovalAction;
  requestedIds: string[];
  products: ShopifyProductInfo[]; // fresh from Shopify
  erpSkus: Set<string>; // SKUs in the latest ERP import
  includeStock: boolean;
  archivedAt: Map<string, Date>; // when our tool last archived each product
  now: Date;
}): { ok: ShopifyProductInfo[]; refused: { id: string; title: string; reason: string }[] } {
  const ok: ShopifyProductInfo[] = [];
  const refused: { id: string; title: string; reason: string }[] = [];
  const byId = new Map(input.products.map(p => [p.id, p]));
  const ids = [...new Set(input.requestedIds)];
  if (ids.length > MAX_PER_ACTION) {
    return { ok: [], refused: ids.map(id => ({ id, title: byId.get(id)?.title ?? id, reason: `meer dan ${MAX_PER_ACTION} artikelen tegelijk` })) };
  }
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) { refused.push({ id, title: id, reason: 'niet (meer) gevonden in Shopify' }); continue; }
    if (!p.allVariantsChecked) { refused.push({ id, title: p.title, reason: 'te veel varianten om volledig te controleren' }); continue; }
    const inErp = p.skus.filter(sku => sku && input.erpSkus.has(sku));
    if (inErp.length) { refused.push({ id, title: p.title, reason: `SKU ${inErp.join(', ')} staat nog in het ERP` }); continue; }
    if (input.action === 'archive' && p.status === 'ARCHIVED') { refused.push({ id, title: p.title, reason: 'al gearchiveerd' }); continue; }
    // Current stock (rechecked now) blocks archiving and deleting unless explicitly allowed.
    if (input.action !== 'restore' && p.positiveStock > 0 && !input.includeStock) { refused.push({ id, title: p.title, reason: `heeft nog voorraad (${p.positiveStock})` }); continue; }
    if (input.action === 'restore' && p.status !== 'ARCHIVED') { refused.push({ id, title: p.title, reason: 'niet gearchiveerd' }); continue; }
    if (input.action === 'delete') {
      if (p.status !== 'ARCHIVED') { refused.push({ id, title: p.title, reason: 'eerst archiveren' }); continue; }
      const at = input.archivedAt.get(id);
      if (!at) { refused.push({ id, title: p.title, reason: 'niet via deze tool gearchiveerd' }); continue; }
      const days = (input.now.getTime() - at.getTime()) / 86_400_000;
      if (days < DELETE_AFTER_DAYS) { refused.push({ id, title: p.title, reason: `pas te verwijderen na ${DELETE_AFTER_DAYS} dagen (nog ${Math.ceil(DELETE_AFTER_DAYS - days)})` }); continue; }
    }
    ok.push(p);
  }
  return { ok, refused };
}

