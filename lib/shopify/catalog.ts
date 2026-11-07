// Catalogue health report for the Shopify shop (pure): finds products with weak photos, missing
// categories, missing or wrong properties and inconsistent tags, and proposes safe fixes.
import { CONDITION, goodImage, starsOf } from '@/lib/shopify/enrich';
import { suggestCategoryTags, titleKey } from '@/lib/shopify/plan';

/** Bulk query: active and draft products with what the checks need. */
export const CATALOG_BULK_QUERY = `{
  products(query: "status:active OR status:draft") {
    edges {
      node {
        id
        title
        handle
        status
        tags
        totalInventory
        mf_conditie: metafield(namespace: "magento", key: "conditie") { value }
        mf_colour: metafield(namespace: "magento", key: "colour_of_product") { value }
        mf_refurb: metafield(namespace: "custom", key: "refurbished_product") { value }
        variants { edges { node { id sku } } }
        media { edges { node { ... on MediaImage { id image { width height } } } } }
        collections { edges { node { id } } }
      }
    }
  }
}`;

export type CatalogProduct = {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  tags: string[];
  totalInventory: number;
  condition: string | null;
  colour: string | null;
  refurbished: boolean;
  skus: string[];
  images: { width: number | null; height: number | null }[];
  collections: number;
};

export function parseCatalog(jsonl: string): CatalogProduct[] {
  const products = new Map<string, CatalogProduct>();
  const lines = jsonl.split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>);
  for (const l of lines) {
    if (typeof l.id === 'string' && l.id.includes('/Product/') && !l.__parentId) {
      const mf = (k: string) => ((l[k] as { value?: string } | null)?.value ?? null);
      products.set(l.id, {
        id: l.id, title: String(l.title ?? ''), handle: String(l.handle ?? ''), status: l.status as CatalogProduct['status'],
        tags: Array.isArray(l.tags) ? (l.tags as string[]) : [], totalInventory: Number(l.totalInventory ?? 0),
        condition: mf('mf_conditie'), colour: mf('mf_colour'), refurbished: mf('mf_refurb') === 'true',
        skus: [], images: [], collections: 0,
      });
    }
  }
  for (const l of lines) {
    const parent = typeof l.__parentId === 'string' ? products.get(l.__parentId) : undefined;
    if (!parent || typeof l.id !== 'string') continue;
    if (l.id.includes('/ProductVariant/')) { if (l.sku) parent.skus.push(String(l.sku).trim()); }
    else if (l.id.includes('/MediaImage/')) { const img = l.image as { width?: number; height?: number } | null; parent.images.push({ width: img?.width ?? null, height: img?.height ?? null }); }
    else if (l.id.includes('/Collection/')) parent.collections++;
  }
  return [...products.values()];
}

export type IssueCode =
  | 'no_photo' | 'low_photo' | 'bad_photo'
  | 'no_category' | 'empty_category_tag' | 'no_collection'
  | 'no_condition' | 'wrong_condition' | 'no_colour'
  | 'main_sku_mismatch' | 'duplicate_title';

export const ISSUE_LABELS: Record<IssueCode, string> = {
  no_photo: 'Geen foto',
  low_photo: 'Geen foto van goede kwaliteit',
  bad_photo: 'Onbruikbare foto (strook/miniatuur)',
  no_category: 'Geen categorie-tag',
  empty_category_tag: 'Lege tag "cat_"',
  no_collection: 'In geen enkele collectie',
  no_condition: 'Uiterlijk ontbreekt',
  wrong_condition: 'Uiterlijk klopt niet met de sterren',
  no_colour: 'Kleur ontbreekt',
  main_sku_mismatch: 'main_sku-tag past niet bij de SKU',
  duplicate_title: 'Dubbele titel',
};

export type Fix =
  | { kind: 'condition'; value: string }
  | { kind: 'category'; tags: string[]; fromSku: string; removeEmptyTag: boolean };

export type CatalogIssue = { productId: string; title: string; handle: string; status: string; skus: string[]; stock: number; issues: IssueCode[]; fixes: Fix[] };

const isUnusable = (i: { width: number | null; height: number | null }) =>
  !i.width || !i.height || Math.min(i.width, i.height) < 200 || Math.max(i.width, i.height) / Math.min(i.width, i.height) > 6;

/** All checks; only products with at least one issue are returned. */
export function analyseCatalog(products: CatalogProduct[]): { issues: CatalogIssue[]; counts: Record<IssueCode, number>; checked: number } {
  const counts = Object.fromEntries(Object.keys(ISSUE_LABELS).map(k => [k, 0])) as Record<IssueCode, number>;
  const titleCount = new Map<string, number>();
  for (const p of products) titleCount.set(titleKey(p.title), (titleCount.get(titleKey(p.title)) ?? 0) + 1);
  // Category suggestions come from products that already have a real category tag.
  const withCategory = products.filter(p => p.tags.some(t => t.startsWith('cat_') && t.length > 4))
    .flatMap(p => p.skus.slice(0, 1).map(sku => ({ sku, title: p.title, tags: p.tags })));

  const issues: CatalogIssue[] = [];
  for (const p of products) {
    const list: IssueCode[] = [];
    const fixes: Fix[] = [];
    // Photos
    if (!p.images.length) list.push('no_photo');
    else {
      if (!p.images.some(i => goodImage({ url: 'x', width: i.width, height: i.height, altText: null }))) list.push('low_photo');
      if (p.images.some(isUnusable)) list.push('bad_photo');
    }
    // Category and collections
    const realCategory = p.tags.some(t => t.startsWith('cat_') && t.length > 4);
    const emptyTag = p.tags.includes('cat_');
    if (!realCategory) list.push('no_category');
    if (emptyTag) list.push('empty_category_tag');
    if (!p.collections) list.push('no_collection');
    if (!realCategory && p.skus[0]) {
      const s = suggestCategoryTags(p.skus[0], p.title, withCategory);
      if (s) fixes.push({ kind: 'category', tags: s.tags, fromSku: s.fromSku, removeEmptyTag: emptyTag });
    }
    // Properties: condition follows the stars in the title
    const stars = starsOf(p.title);
    if (stars && CONDITION[stars]) {
      if (!p.condition) { list.push('no_condition'); fixes.push({ kind: 'condition', value: CONDITION[stars] }); }
      else if (!p.condition.trim().startsWith(`${stars}*`)) { list.push('wrong_condition'); fixes.push({ kind: 'condition', value: CONDITION[stars] }); }
    }
    if (p.refurbished && !p.colour) list.push('no_colour');
    // Tags
    const mainSku = p.tags.filter(t => t.startsWith('main_sku_')).map(t => t.slice(9));
    const norm = (s: string) => s.replace(/^0+/, '');
    if (mainSku.length && !mainSku.some(m => p.skus.some(s => norm(s) === norm(m)))) list.push('main_sku_mismatch');
    if ((titleCount.get(titleKey(p.title)) ?? 0) > 1) list.push('duplicate_title');

    for (const c of list) counts[c]++;
    if (list.length) issues.push({ productId: p.id, title: p.title, handle: p.handle, status: p.status, skus: p.skus, stock: p.totalInventory, issues: list, fixes });
  }
  // Products with stock first (they are visible to customers), then by title.
  issues.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.title.localeCompare(b.title));
  return { issues, counts, checked: products.length };
}
