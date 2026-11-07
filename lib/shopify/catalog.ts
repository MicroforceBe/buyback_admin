// Catalogue health report for the Shopify shop (pure): finds products with weak photos, missing
// categories, missing or wrong properties and inconsistent tags, and proposes safe fixes.
import { CONDITION, goodImage, starsOf } from '@/lib/shopify/enrich';
import { modelOf } from '@/lib/shopify/enrich';
import { suggestCategoryTags, titleKey } from '@/lib/shopify/plan';
import { EMPTY_DESCRIPTION_WORDS, emptyImageCount, hasClaims, hasCssAsText, hasEmptyImage, hasPlaceholder, namePlaceholderCount, scriptCount, hasH1, isBlankDescription, SEO_SKIP_TAG, seoConditionMismatch, seoIsRaw, mentionsOtherModel, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, SHORT_DESCRIPTION_WORDS, suggestSeoDescription, suggestSeoTitle, textHash, wordCount } from '@/lib/shopify/seo';

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
        descriptionHtml
        seo { title description }
        mf_garantie: metafield(namespace: "magento", key: "garantie") { value }
        mf_cpu: metafield(namespace: "magento", key: "processor_model") { value }
        mf_gpu: metafield(namespace: "magento", key: "discretegraphicsadaptermodel") { value }
        mf_year: metafield(namespace: "magento", key: "modeljaar") { value }
        mf_layout: metafield(namespace: "magento", key: "keyboard_layout") { value }
        mf_conditie: metafield(namespace: "magento", key: "conditie") { value }
        mf_colour: metafield(namespace: "custom", key: "color_swatch") { value }
        mf_refurb: metafield(namespace: "custom", key: "refurbished_product") { value }
        variants { edges { node { id sku } } }
        media { edges { node { ... on MediaImage { id alt image { width height } } } } }
        collections { edges { node { id } } }
      }
    }
  }
}`;

/** In this order: the first properties that differ within a group of equal titles make the SEO text unique. */
export const SPEC_KEYS = ['cpu', 'gpu', 'year', 'layout'] as const;
export type SpecKey = (typeof SPEC_KEYS)[number];
const MAX_DISTINGUISHING = 2;

/**
 * For products sharing a title: the property values that tell this one apart from the others,
 * e.g. ["i7-1185G7"] or ["AMD Radeon Pro 5500M"]. Empty when the title is unique or nothing differs.
 */
export function distinguishingSpecs(p: CatalogProduct, sameTitle: CatalogProduct[]): string[] {
  if (sameTitle.length < 2) return [];
  const differing = SPEC_KEYS.filter(k => new Set(sameTitle.map(o => (o.specs[k] ?? '').toLowerCase())).size > 1);
  const titleLower = p.title.toLowerCase();
  // Missing values and values already in the title are dropped first, so they never use up a slot.
  return differing.map(k => p.specs[k]).filter((v): v is string => !!v && !titleLower.includes(v.toLowerCase())).slice(0, MAX_DISTINGUISHING);
}

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
  images: { width: number | null; height: number | null; alt: string }[];
  collections: number;
  seoTitle: string;
  seoDescription: string;
  warranty: string | null;
  /** Properties that can tell products with the same title apart (Processor Model, graphics card, model year, keyboard). */
  specs: Partial<Record<SpecKey, string>>;
  descriptionWords: number;
  descriptionBlank: boolean;
  descriptionHash: string | null;
  descriptionH1: boolean;
  descriptionH1Count: number;
  descriptionEmptyImage: boolean;
  descriptionOtherModel: boolean;
  /** <script> blocks (e.g. JSON-LD) in the description. */
  descriptionScripts: number;
  /** Company-name placeholders ("[Bedrijfsnaam]") the clean-up replaces by the shop name. */
  descriptionNames: number;
  /** Images without a src the clean-up removes. */
  descriptionEmptyImages: number;
  descriptionPlaceholder: boolean;
  descriptionClaims: boolean;
  descriptionCssText: boolean;
};

export function parseCatalog(jsonl: string): CatalogProduct[] {
  const products = new Map<string, CatalogProduct>();
  const lines = jsonl.split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>);
  for (const l of lines) {
    if (typeof l.id === 'string' && l.id.includes('/Product/') && !l.__parentId) {
      const mf = (k: string) => ((l[k] as { value?: string } | null)?.value ?? null);
      const html = typeof l.descriptionHtml === 'string' ? l.descriptionHtml : '';
      const seo = (l.seo ?? {}) as { title?: string | null; description?: string | null };
      products.set(l.id, {
        id: l.id, title: String(l.title ?? ''), handle: String(l.handle ?? ''), status: l.status as CatalogProduct['status'],
        tags: Array.isArray(l.tags) ? (l.tags as string[]) : [], totalInventory: Number(l.totalInventory ?? 0),
        condition: mf('mf_conditie'), colour: mf('mf_colour'), refurbished: mf('mf_refurb') === 'true',
        skus: [], images: [], collections: 0,
        seoTitle: (seo.title ?? '').trim(), seoDescription: (seo.description ?? '').trim(), warranty: mf('mf_garantie'),
        specs: Object.fromEntries(SPEC_KEYS.map(k => [k, mf(`mf_${k}`)?.trim()]).filter(([, v]) => v)),
        descriptionWords: wordCount(html), descriptionBlank: isBlankDescription(html), descriptionHash: textHash(html), descriptionH1: hasH1(html), descriptionH1Count: (html.match(/<h1[\s>]/gi) ?? []).length, descriptionEmptyImage: hasEmptyImage(html),
        descriptionOtherModel: mentionsOtherModel(String(l.title ?? ''), html),
        descriptionScripts: scriptCount(html), descriptionNames: namePlaceholderCount(html), descriptionEmptyImages: emptyImageCount(html), descriptionPlaceholder: hasPlaceholder(html),
        descriptionClaims: hasClaims(html), descriptionCssText: hasCssAsText(html),
      });
    }
  }
  for (const l of lines) {
    const parent = typeof l.__parentId === 'string' ? products.get(l.__parentId) : undefined;
    if (!parent || typeof l.id !== 'string') continue;
    if (l.id.includes('/ProductVariant/')) { if (l.sku) parent.skus.push(String(l.sku).trim()); }
    else if (l.id.includes('/MediaImage/')) { const img = l.image as { width?: number; height?: number } | null; parent.images.push({ width: img?.width ?? null, height: img?.height ?? null, alt: String(l.alt ?? '').trim() }); }
    else if (l.id.includes('/Collection/')) parent.collections++;
  }
  return [...products.values()];
}

export type IssueCode =
  | 'no_photo' | 'low_photo' | 'bad_photo'
  | 'no_category' | 'empty_category_tag' | 'no_collection'
  | 'no_condition' | 'wrong_condition' | 'no_colour'
  | 'main_sku_mismatch' | 'duplicate_title'
  | 'seo_title_missing' | 'seo_description_missing' | 'seo_too_long'
  | 'seo_raw' | 'seo_condition_mismatch' | 'seo_description_duplicate'
  | 'description_empty' | 'description_short' | 'description_duplicate' | 'description_other_model'
  | 'description_h1' | 'description_empty_image' | 'alt_missing' | 'seo_overwritten'
  | 'description_script' | 'description_placeholder' | 'description_claims' | 'description_css' | 'seo_outdated';

export const ISSUE_LABELS: Record<IssueCode, string> = {
  no_photo: 'Geen foto',
  low_photo: 'Geen foto van goede kwaliteit',
  bad_photo: 'Onbruikbare foto (strook/miniatuur)',
  no_category: 'Geen categorie-tag',
  empty_category_tag: 'Lege tag "cat_"',
  no_collection: 'In geen enkele collectie',
  no_condition: 'Uiterlijk ontbreekt',
  wrong_condition: 'Uiterlijk klopt niet met de sterren',
  no_colour: 'Kleurstaal (Color Swatch) ontbreekt',
  main_sku_mismatch: 'main_sku-tag past niet bij de SKU',
  duplicate_title: 'Dubbele titel',
  seo_title_missing: 'SEO-titel ontbreekt',
  seo_description_missing: 'Meta-description ontbreekt',
  seo_too_long: `SEO-titel > ${SEO_TITLE_MAX} of meta-description > ${SEO_DESCRIPTION_MAX} tekens`,
  seo_raw: 'SEO-tekst is de ruwe titel of het algemene sjabloon',
  seo_condition_mismatch: 'SEO-tekst noemt een andere conditie',
  seo_description_duplicate: 'Meta-description identiek aan ander product',
  description_empty: 'Geen beschrijving',
  description_short: `Korte beschrijving (< ${SHORT_DESCRIPTION_WORDS} woorden)`,
  description_duplicate: 'Beschrijving identiek aan ander product',
  description_other_model: 'Koppen in tekst noemen ander model',
  description_h1: 'Extra H1-kop in de beschrijving',
  description_empty_image: 'Lege afbeelding in de beschrijving',
  alt_missing: 'Foto zonder alt-tekst',
  seo_overwritten: 'SEO-tekst van de tool is overschreven',
  seo_outdated: 'SEO-tekst van de tool kan bijgewerkt worden',
  description_script: 'Verborgen code (JSON-LD/script) in de beschrijving',
  description_placeholder: 'Placeholder in de beschrijving ([Bedrijfsnaam], uwdomein …)',
  description_claims: 'Belofte om te controleren (batterij, CO2)',
  description_css: 'Code (CSS) zichtbaar als tekst',
};

/** Groups for the summary tiles. */
export const ISSUE_GROUPS: { label: string; codes: IssueCode[] }[] = [
  { label: 'Foto\'s, categorie en eigenschappen', codes: ['no_photo', 'low_photo', 'bad_photo', 'no_category', 'empty_category_tag', 'no_collection', 'no_condition', 'wrong_condition', 'no_colour', 'main_sku_mismatch', 'duplicate_title'] },
  { label: 'Vindbaarheid (SEO)', codes: ['seo_title_missing', 'seo_description_missing', 'seo_too_long', 'seo_raw', 'seo_condition_mismatch', 'seo_description_duplicate', 'description_empty', 'description_short', 'description_duplicate', 'description_other_model', 'description_h1', 'description_empty_image', 'alt_missing', 'seo_overwritten', 'seo_outdated'] },
  { label: 'Geplakte teksten', codes: ['description_script', 'description_placeholder', 'description_claims', 'description_css'] },
];

export type Fix =
  | { kind: 'condition'; value: string }
  | { kind: 'category'; tags: string[]; fromSku: string; removeEmptyTag: boolean }
  | { kind: 'seo'; title: string | null; description: string | null }
  | { kind: 'seo_replace'; title: string; description: string; oldTitle: string; oldDescription: string; generated?: { title: boolean; description: boolean } }
  | { kind: 'description'; fromProductId: string; fromTitle: string }
  | { kind: 'heading'; count: number }
  | { kind: 'clean'; scripts: number; names: number; images?: number };

export const FIX_KINDS = ['condition', 'category', 'seo', 'seo_replace', 'description', 'heading', 'clean'] as const;

export type CatalogIssue = { productId: string; title: string; handle: string; status: string; skus: string[]; stock: number; issues: IssueCode[]; fixes: Fix[] };

const isUnusable = (i: { width: number | null; height: number | null }) =>
  !i.width || !i.height || Math.min(i.width, i.height) < 200 || Math.max(i.width, i.height) / Math.min(i.width, i.height) > 6;

/** All checks; only products with at least one issue are returned. */
/** SEO texts the tool set last on a product, and which of the two fields it wrote itself (the other was kept). */
export type ManagedSeo = { title: string | null; description: string | null; generated?: { title: boolean; description: boolean } };

export function analyseCatalog(products: CatalogProduct[], managed: Map<string, ManagedSeo> = new Map()): { issues: CatalogIssue[]; counts: Record<IssueCode, number>; checked: number } {
  const counts = Object.fromEntries(Object.keys(ISSUE_LABELS).map(k => [k, 0])) as Record<IssueCode, number>;
  const titleCount = new Map<string, number>();
  for (const p of products) titleCount.set(titleKey(p.title), (titleCount.get(titleKey(p.title)) ?? 0) + 1);
  // Category suggestions come from products that already have a real category tag.
  const withCategory = products.filter(p => p.tags.some(t => t.startsWith('cat_') && t.length > 4))
    .flatMap(p => p.skus.slice(0, 1).map(sku => ({ sku, title: p.title, tags: p.tags })));

  const byTitle = new Map<string, CatalogProduct[]>();
  for (const p of products) { const k = titleKey(p.title); byTitle.set(k, [...(byTitle.get(k) ?? []), p]); }
  const metaCount = new Map<string, number>();
  for (const p of products) if (p.seoDescription) metaCount.set(p.seoDescription.toLowerCase(), (metaCount.get(p.seoDescription.toLowerCase()) ?? 0) + 1);
  const hashCount = new Map<string, number>();
  for (const p of products) if (p.descriptionHash && p.descriptionWords >= EMPTY_DESCRIPTION_WORDS) hashCount.set(p.descriptionHash, (hashCount.get(p.descriptionHash) ?? 0) + 1);
  // Description sources: per model, the product with the longest description that names no other model.
  const descriptionSource = new Map<string, CatalogProduct>();
  for (const p of products) {
    const m = modelOf(p.title);
    if (!m || p.descriptionWords < SHORT_DESCRIPTION_WORDS || p.descriptionOtherModel || p.descriptionScripts || p.descriptionPlaceholder) continue;
    const cur = descriptionSource.get(m);
    if (!cur || p.descriptionWords > cur.descriptionWords) descriptionSource.set(m, p);
  }

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
    // Refurbished products show their colour through the Color Swatch (custom.color_swatch).
    if (p.refurbished && !p.colour) list.push('no_colour');
    // Tags
    const mainSku = p.tags.filter(t => t.startsWith('main_sku_')).map(t => t.slice(9));
    const norm = (s: string) => s.replace(/^0+/, '');
    if (mainSku.length && !mainSku.some(m => p.skus.some(s => norm(s) === norm(m)))) list.push('main_sku_mismatch');
    if ((titleCount.get(titleKey(p.title)) ?? 0) > 1) list.push('duplicate_title');
    // Findability (SEO)
    if (!p.seoTitle) list.push('seo_title_missing');
    if (!p.seoDescription) list.push('seo_description_missing');
    const tooLong = p.seoTitle.length > SEO_TITLE_MAX || p.seoDescription.length > SEO_DESCRIPTION_MAX;
    const raw = seoIsRaw(p.seoTitle, p.seoDescription, p.refurbished);
    const mismatch = seoConditionMismatch(p.title, p.seoTitle, p.seoDescription);
    const dupMeta = !!p.seoDescription && (metaCount.get(p.seoDescription.toLowerCase()) ?? 0) > 1;
    if (tooLong) list.push('seo_too_long');
    if (raw) list.push('seo_raw');
    if (mismatch) list.push('seo_condition_mismatch');
    if (dupMeta) list.push('seo_description_duplicate');
    // A weak SEO text is replaced as a whole (separate choice, old text kept for undo); otherwise only empty fields are filled.
    // Same title as other products: the differing properties (Processor Model, graphics card, …) make the SEO text unique.
    const extras = distinguishingSpecs(p, byTitle.get(titleKey(p.title)) ?? []);
    const proposal = { title: suggestSeoTitle(p.title, p.refurbished, extras), description: suggestSeoDescription(p.title, p.refurbished, p.warranty, extras) };
    const weak = p.seoTitle && p.seoDescription && (tooLong || raw || mismatch || dupMeta);
    if (weak && (proposal.title !== p.seoTitle || proposal.description !== p.seoDescription)) fixes.push({ kind: 'seo_replace', ...proposal, oldTitle: p.seoTitle, oldDescription: p.seoDescription });
    else if (!p.seoTitle || !p.seoDescription) fixes.push({ kind: 'seo', title: p.seoTitle ? null : proposal.title, description: p.seoDescription ? null : proposal.description });
    else {
      // Texts this tool placed earlier, still unchanged, follow the current proposal (e.g. a new quality line).
      // Only the fields the tool wrote itself are updated; a field written by hand is kept as it is.
      const placed = managed.get(p.id);
      const gen = placed?.generated ?? { title: false, description: false };
      const update = { title: gen.title ? proposal.title : p.seoTitle, description: gen.description ? proposal.description : p.seoDescription };
      if (placed && (placed.title ?? '') === p.seoTitle && (placed.description ?? '') === p.seoDescription && (update.title !== p.seoTitle || update.description !== p.seoDescription)) {
        list.push('seo_outdated');
        // Ownership is carried along, so a kept hand-written field stays the user's after this replacement too.
        fixes.push({ kind: 'seo_replace', ...update, oldTitle: p.seoTitle, oldDescription: p.seoDescription, generated: gen });
      }
    }
    if (p.descriptionWords < EMPTY_DESCRIPTION_WORDS) {
      list.push('description_empty');
      // Only a truly empty description is filled; a short text is reported but never replaced.
      const src = p.descriptionBlank ? descriptionSource.get(modelOf(p.title)) : undefined;
      if (src && src.id !== p.id) fixes.push({ kind: 'description', fromProductId: src.id, fromTitle: src.title });
    } else if (p.descriptionWords < SHORT_DESCRIPTION_WORDS) list.push('description_short');
    if (p.descriptionHash && (hashCount.get(p.descriptionHash) ?? 0) > 1) list.push('description_duplicate');
    if (p.descriptionOtherModel) list.push('description_other_model');
    if (p.descriptionH1) { list.push('description_h1'); fixes.push({ kind: 'heading', count: p.descriptionH1Count }); }
    if (p.descriptionEmptyImage) list.push('description_empty_image');
    // Pasted texts: hidden code is removed and "[Bedrijfsnaam]" becomes the shop name; the rest is only reported.
    if (p.descriptionScripts) list.push('description_script');
    if (p.descriptionPlaceholder) list.push('description_placeholder');
    if (p.descriptionClaims) list.push('description_claims');
    if (p.descriptionCssText) list.push('description_css');
    if (p.descriptionScripts || p.descriptionNames || p.descriptionEmptyImages) fixes.push({ kind: 'clean', scripts: p.descriptionScripts, names: p.descriptionNames, images: p.descriptionEmptyImages });
    if (p.images.some(i => !i.alt)) list.push('alt_missing');
    // SEO text set by this tool (latest applied fix, not undone) that is no longer there, or lost its TinySEO skip tag.
    const own = managed.get(p.id);
    if (own && ((own.title ?? '') !== p.seoTitle || (own.description ?? '') !== p.seoDescription || !p.tags.includes(SEO_SKIP_TAG))) list.push('seo_overwritten');

    for (const c of list) counts[c]++;
    if (list.length) issues.push({ productId: p.id, title: p.title, handle: p.handle, status: p.status, skus: p.skus, stock: p.totalInventory, issues: list, fixes });
  }
  // Products with stock first (they are visible to customers), then by title.
  issues.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.title.localeCompare(b.title));
  return { issues, counts, checked: products.length };
}
