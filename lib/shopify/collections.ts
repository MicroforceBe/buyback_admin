// Collection (category / model page) SEO report (pure): finds collections without SEO texts or
// description, extra H1 headings, empty or duplicate collections and internal collections that
// search engines can index, and proposes safe fixes.
import { hasCssAsText, hasPlaceholder, namePlaceholderCount, scriptCount, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, textHash, wordCount } from '@/lib/shopify/seo';

/** Bulk query: every collection with its SEO fields and its products (status, stock, refurbished). */
export const COLLECTIONS_BULK_QUERY = `{
  collections {
    edges {
      node {
        id
        title
        handle
        seo { title description }
        descriptionHtml
        hidden: metafield(namespace: "seo", key: "hidden") { value }
        products {
          edges {
            node {
              id
              status
              totalInventory
              rf: metafield(namespace: "custom", key: "refurbished_product") { value }
            }
          }
        }
      }
    }
  }
}`;

export type CollectionInfo = {
  id: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
  hidden: boolean;
  descriptionWords: number;
  descriptionH1Count: number;
  descriptionScripts: number;
  descriptionNames: number;
  descriptionPlaceholder: boolean;
  descriptionCssText: boolean;
  products: number;
  active: number;
  inStock: number;
  refurbished: number;
  /** Fingerprint of the set of active products, to find collections showing exactly the same products. */
  activeSet: string | null;
};

export function parseCollections(jsonl: string): CollectionInfo[] {
  const lines = jsonl.split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>);
  const out = new Map<string, CollectionInfo & { ids: string[] }>();
  for (const l of lines) {
    if (typeof l.id !== 'string' || !l.id.includes('/Collection/') || l.__parentId) continue;
    const html = typeof l.descriptionHtml === 'string' ? l.descriptionHtml : '';
    const seo = (l.seo ?? {}) as { title?: string | null; description?: string | null };
    out.set(l.id, {
      id: l.id, title: String(l.title ?? ''), handle: String(l.handle ?? ''),
      seoTitle: (seo.title ?? '').trim(), seoDescription: (seo.description ?? '').trim(),
      hidden: String((l.hidden as { value?: string } | null)?.value ?? '') === '1',
      descriptionWords: wordCount(html), descriptionH1Count: (html.match(/<h1[\s>]/gi) ?? []).length,
      descriptionScripts: scriptCount(html), descriptionNames: namePlaceholderCount(html), descriptionPlaceholder: hasPlaceholder(html), descriptionCssText: hasCssAsText(html),
      products: 0, active: 0, inStock: 0, refurbished: 0, activeSet: null, ids: [],
    });
  }
  for (const l of lines) {
    const c = typeof l.__parentId === 'string' ? out.get(l.__parentId) : undefined;
    if (!c || typeof l.id !== 'string' || !l.id.includes('/Product/')) continue;
    c.products++;
    if (l.status === 'ACTIVE') {
      c.active++;
      c.ids.push(l.id);
      if (Number(l.totalInventory ?? 0) > 0) c.inStock++;
      if ((l.rf as { value?: string } | null)?.value === 'true') c.refurbished++;
    }
  }
  return [...out.values()].map(({ ids, ...c }) => ({ ...c, activeSet: ids.length ? textHash(ids.sort().join(' ')) : null }));
}

export type CollectionIssueCode =
  | 'col_seo_title_missing' | 'col_seo_description_missing' | 'col_seo_too_long'
  | 'col_description_empty' | 'col_description_short' | 'col_h1'
  | 'col_empty' | 'col_internal' | 'col_duplicate'
  | 'col_script' | 'col_placeholder' | 'col_css';

export const COLLECTION_ISSUE_LABELS: Record<CollectionIssueCode, string> = {
  col_seo_title_missing: 'SEO-titel ontbreekt',
  col_seo_description_missing: 'Meta-description ontbreekt',
  col_seo_too_long: `SEO-titel > ${SEO_TITLE_MAX} of meta-description > ${SEO_DESCRIPTION_MAX} tekens`,
  col_description_empty: 'Geen tekst op de pagina',
  col_description_short: 'Korte tekst (< 150 woorden)',
  col_h1: 'Extra H1-kop in de tekst',
  col_empty: 'Geen actieve producten',
  col_internal: 'Interne collectie zichtbaar voor Google',
  col_duplicate: 'Zelfde producten als een andere collectie',
  col_script: 'Verborgen code (JSON-LD/script) in de tekst',
  col_placeholder: 'Placeholder in de tekst ([Bedrijfsnaam], uwdomein …)',
  col_css: 'Code (CSS) zichtbaar als tekst',
};

export type CollectionFix =
  | { kind: 'col_seo'; title: string | null; description: string | null }
  | { kind: 'col_hide' }
  | { kind: 'col_heading'; count: number }
  | { kind: 'col_clean'; scripts: number; names: number };

export const COLLECTION_FIX_KINDS = ['col_seo', 'col_hide', 'col_heading', 'col_clean'] as const;

export type CollectionIssue = {
  collectionId: string; title: string; handle: string; active: number; inStock: number; hidden: boolean;
  issues: CollectionIssueCode[]; fixes: CollectionFix[]; duplicateOf?: string;
};

/** Internal collections (cross-sell, sorting, homepage): they have no value as a page in Google. */
export function isInternalCollection(title: string, handle: string): boolean {
  return /^cs[q_-]*[_ -]?atb/i.test(title) || /^csq?[_-]atb/i.test(handle)
    || /^best[ -]?sell(er|ing)?s?$/i.test(title.trim()) || handle === 'frontpage' || /^home ?page$/i.test(title.trim());
}

const DEVICE_WORDS: [RegExp, string][] = [
  [/(^|-)iphone(-|$)/, 'iPhone'], [/(^|-)ipad(-|$)/, 'iPad'], [/(^|-)imac(-|$)/, 'iMac'], [/(^|-)macbook(-|$)/, 'MacBook'],
  [/(^|-)apple-watch(-|$)/, 'Apple Watch'], [/(^|-)galaxy(-|$)/, 'Galaxy'],
];

/** Name for SEO texts: the title, with the device word from the handle when the title leaves it out ("11 Pro Max" → "iPhone 11 Pro Max"). */
export function collectionName(title: string, handle: string): string {
  const base = title.replace(/^\s*refurbished\s+/i, '').trim();
  for (const [re, word] of DEVICE_WORDS) {
    if (re.test(handle.toLowerCase()) && !base.toLowerCase().includes(word.toLowerCase())) return `${word} ${base}`;
  }
  return base;
}

/** Refurbished page: most active products are refurbished, or the handle says so when there are none. */
export const isRefurbishedCollection = (c: Pick<CollectionInfo, 'active' | 'refurbished' | 'handle'>) =>
  c.active ? c.refurbished * 2 >= c.active : /refurbished/i.test(c.handle);

const BRAND = 'Microforce';
const PICKUP = ['Gratis afhalen in Gentbrugge, Antwerpen & Oudenaarde of snelle levering in België.', 'Gratis afhalen of snelle levering in België.'];
const fit = (options: string[], max: number) => options.find(o => o.length <= max) ?? options[options.length - 1].slice(0, max).replace(/\s+\S*$/, '');

export function suggestCollectionSeoTitle(name: string, refurbished: boolean): string {
  return fit(refurbished
    ? [`Refurbished ${name} kopen – met garantie | ${BRAND}`, `Refurbished ${name} kopen | ${BRAND}`, `Refurbished ${name} | ${BRAND}`, `Refurbished ${name}`]
    : [`${name} kopen | ${BRAND}`, `${name} | ${BRAND}`, name], SEO_TITLE_MAX);
}

/** Meta description without numbers or prices (they change); only what the shop already promises. */
export function suggestCollectionSeoDescription(name: string, refurbished: boolean): string {
  const leads = refurbished
    // A collection holds every grade, so it promises checked (not premium) quality; premium is for 4* and 5* only.
    ? [`Koop een refurbished ${name} bij ${BRAND}: gecontroleerde kwaliteit aan een scherpe prijs, met garantie.`, `Koop een refurbished ${name} bij ${BRAND}, met garantie en in verschillende kleuren, opslag en condities.`, `Koop een refurbished ${name} bij ${BRAND} met garantie.`]
    : [`${name} kopen bij ${BRAND} met garantie.`];
  const options = leads.flatMap(l => [...PICKUP.map(p => `${l} ${p}`), l]);
  return fit(options, SEO_DESCRIPTION_MAX);
}

export const SHORT_COLLECTION_WORDS = 150;
const EMPTY_WORDS = 20;

export function analyseCollections(collections: CollectionInfo[]): { issues: CollectionIssue[]; counts: Record<CollectionIssueCode, number>; checked: number } {
  const counts = Object.fromEntries(Object.keys(COLLECTION_ISSUE_LABELS).map(k => [k, 0])) as Record<CollectionIssueCode, number>;
  // Duplicates: visible, non-internal collections with exactly the same active products; the one with most text
  // (then most stock) is the "original".
  const bySet = new Map<string, CollectionInfo[]>();
  for (const c of collections) if (c.activeSet && !c.hidden && !isInternalCollection(c.title, c.handle)) bySet.set(c.activeSet, [...(bySet.get(c.activeSet) ?? []), c]);
  const issues: CollectionIssue[] = [];
  for (const c of collections) {
    const list: CollectionIssueCode[] = [];
    const fixes: CollectionFix[] = [];
    const internal = isInternalCollection(c.title, c.handle);
    let duplicateOf: string | undefined;
    if (internal) {
      // Only the visibility matters for internal collections; their texts are never shown to customers.
      if (!c.hidden) { list.push('col_internal'); fixes.push({ kind: 'col_hide' }); }
    } else if (!c.hidden) {
      const name = collectionName(c.title, c.handle);
      const refurb = isRefurbishedCollection(c);
      if (!c.seoTitle) list.push('col_seo_title_missing');
      if (!c.seoDescription) list.push('col_seo_description_missing');
      if (c.seoTitle.length > SEO_TITLE_MAX || c.seoDescription.length > SEO_DESCRIPTION_MAX) list.push('col_seo_too_long');
      if (!c.seoTitle || !c.seoDescription) fixes.push({ kind: 'col_seo', title: c.seoTitle ? null : suggestCollectionSeoTitle(name, refurb), description: c.seoDescription ? null : suggestCollectionSeoDescription(name, refurb) });
      if (c.descriptionWords < EMPTY_WORDS) list.push('col_description_empty');
      else if (c.descriptionWords < SHORT_COLLECTION_WORDS) list.push('col_description_short');
      if (c.descriptionH1Count) { list.push('col_h1'); fixes.push({ kind: 'col_heading', count: c.descriptionH1Count }); }
      if (c.descriptionScripts) list.push('col_script');
      if (c.descriptionPlaceholder) list.push('col_placeholder');
      if (c.descriptionCssText) list.push('col_css');
      if (c.descriptionScripts || c.descriptionNames) fixes.push({ kind: 'col_clean', scripts: c.descriptionScripts, names: c.descriptionNames });
      if (!c.active) list.push('col_empty');
      const same = c.activeSet ? bySet.get(c.activeSet) ?? [] : [];
      if (same.length > 1) {
        const original = [...same].sort((a, b) => b.descriptionWords - a.descriptionWords || b.inStock - a.inStock || a.title.localeCompare(b.title))[0];
        if (original.id !== c.id) { list.push('col_duplicate'); duplicateOf = original.title; }
      }
    }
    for (const code of list) counts[code]++;
    if (list.length) issues.push({ collectionId: c.id, title: c.title, handle: c.handle, active: c.active, inStock: c.inStock, hidden: c.hidden, issues: list, fixes, ...(duplicateOf ? { duplicateOf } : {}) });
  }
  // Pages with products in stock first (they matter most), then by title.
  issues.sort((a, b) => b.inStock - a.inStock || a.title.localeCompare(b.title));
  return { issues, counts, checked: collections.length };
}

