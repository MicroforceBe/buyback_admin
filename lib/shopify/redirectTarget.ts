// Where the URL of a product that left the ERP should point: pure rules, no I/O.
// 1. another active product of the same model (colour + storage), in stock and on the Online Store,
// 2. else the product's best collection (pickRedirectCollection: model page, then a visible hub, never the
//    generic, old Magento, feed or filter collections),
// 3. else the shop's catalogue.
import { modelKey } from '@/lib/marketing/merchantFeed';

/** online: published on the Online Store (an active but unpublished product is still a 404). */
export type RedirectCandidate = { handle: string; title: string; status: string; stock: number; online: boolean };

const GENERIC_COLLECTIONS = new Set(['all', 'frontpage']);
// Never a redirect target: old Magento categories (e.g. microforce-reparaties-laptop-laptop, a copy of
// refurbished-laptop without the new page), feed collections and the filter collections ("Laptops met
// 512 GB SSD") that exist for the old theme.
const BLOCKED_COLLECTION = /^(microforce-reparaties-|xml-|laptops-met-)/;

export function usableCollection(handle: string | null | undefined): handle is string {
  return !!handle && !GENERIC_COLLECTIONS.has(handle) && !BLOCKED_COLLECTION.test(handle);
}

/** The collection fields pickRedirectCollection needs; REDIRECT_COLLECTIONS in client.ts selects them. */
export type RedirectCollection = {
  handle: string;
  productsCount?: { count: number } | null;
  modelIntro?: { id: string } | null; // microforce.model_intro: a model page (MP)
  hubIntro?: { id: string } | null; // mf_tekst.intro: a category or brand page (CP/HMP)
  seoHidden?: { value: string } | null; // seo.hidden = 1: not shown to search engines (yet)
};

/**
 * The page an archived product's URL falls back to: its model page; else a hub page that search engines
 * may see (the most specific one, so a brand page beats the category once it is public); else the first
 * usable collection in Shopify's order; else null (→ /collections/all).
 */
export function pickRedirectCollection(nodes: RedirectCollection[] | null | undefined): string | null {
  const usable = (nodes ?? []).filter(c => usableCollection(c.handle));
  const size = (c: RedirectCollection) => c.productsCount?.count ?? Number.MAX_SAFE_INTEGER;
  const model = usable.filter(c => c.modelIntro).sort((a, b) => size(a) - size(b))[0];
  if (model) return model.handle;
  const hub = usable.filter(c => c.hubIntro && c.seoHidden?.value !== '1').sort((a, b) => size(a) - size(b))[0];
  if (hub) return hub.handle;
  return usable[0]?.handle ?? null;
}

export function chooseRedirectTarget(
  product: { handle: string; title: string; collectionHandle: string | null },
  candidates: RedirectCandidate[],
): string {
  const key = modelKey(product.title);
  const sibling = candidates
    .filter(c => c.handle !== product.handle && c.status === 'ACTIVE' && c.online && c.stock > 0 && modelKey(c.title) === key)
    .sort((a, b) => b.stock - a.stock || a.handle.localeCompare(b.handle))[0];
  if (key && sibling) return `/products/${sibling.handle}`;
  if (usableCollection(product.collectionHandle)) return `/collections/${product.collectionHandle}`;
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
