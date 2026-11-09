// Where the URL of a product that left the ERP should point: pure rules, no I/O.
// 1. another active product of the same model (colour + storage), in stock and on the Online Store,
// 2. else the product's own collection (never the generic ones),
// 3. else the shop's catalogue.
import { modelKey } from '@/lib/marketing/merchantFeed';

/** online: published on the Online Store (an active but unpublished product is still a 404). */
export type RedirectCandidate = { handle: string; title: string; status: string; stock: number; online: boolean };

const GENERIC_COLLECTIONS = new Set(['all', 'frontpage']);

export function chooseRedirectTarget(
  product: { handle: string; title: string; collectionHandle: string | null },
  candidates: RedirectCandidate[],
): string {
  const key = modelKey(product.title);
  const sibling = candidates
    .filter(c => c.handle !== product.handle && c.status === 'ACTIVE' && c.online && c.stock > 0 && modelKey(c.title) === key)
    .sort((a, b) => b.stock - a.stock || a.handle.localeCompare(b.handle))[0];
  if (key && sibling) return `/products/${sibling.handle}`;
  if (product.collectionHandle && !GENERIC_COLLECTIONS.has(product.collectionHandle)) return `/collections/${product.collectionHandle}`;
  return '/collections/all';
}

/**
 * Search words for Shopify's product search: the model key's words that also appear as-is in the raw
 * title. Words the key normalises (Naturel → natural, SpaceGrey → space grey, Titan. → titanium) are left
 * out, because Shopify ANDs the clauses and would miss siblings spelled the other way; the exact model
 * match happens afterwards in chooseRedirectTarget.
 */
export function siblingQuery(title: string): string {
  const raw = new Set(title.toLowerCase().split(/[\s/,()]+/).filter(Boolean));
  const words = modelKey(title).split(' ').filter(w => w && raw.has(w)).map(w => w.replace(/["\\]/g, '')).filter(Boolean).slice(0, 8);
  return ['status:active', 'inventory_total:>0', ...words.map(w => `title:"${w}"`)].join(' ');
}
