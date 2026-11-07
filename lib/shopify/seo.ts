// SEO helpers for product pages (pure): text checks on the description, suggested SEO title and
// meta description, and the description a new draft takes over from a product of the same model.
import { CONDITION, modelOf, starsOf } from '@/lib/shopify/enrich';

export const SEO_TITLE_MAX = 60;
/** Products with this tag are skipped by TinySEO's automatic metadata templates: our tool manages their SEO texts. */
export const SEO_SKIP_TAG = 'tinyimg_metadata_skip';
export const SEO_DESCRIPTION_MAX = 155;
export const SHORT_DESCRIPTION_WORDS = 100;
export const EMPTY_DESCRIPTION_WORDS = 20;
const BRAND = 'Microforce';

const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Visible text of a description: tags, scripts and styles removed, whitespace collapsed. */
export function textOf(html: string | null | undefined): string {
  return decode((html ?? '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export const wordCount = (html: string | null | undefined) => (textOf(html) ? textOf(html).split(' ').length : 0);

/** Short fingerprint of the visible text, to find identical descriptions (FNV-1a, 32 bit). */
export function textHash(html: string | null | undefined): string | null {
  const t = textOf(html).toLowerCase();
  if (!t) return null;
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

export const hasH1 = (html: string | null | undefined) => /<h1[\s>]/i.test(html ?? '');
/** An <img> without a usable src (renders as a broken image). */
export const hasEmptyImage = (html: string | null | undefined) => [...(html ?? '').matchAll(/<img\b[^>]*>/gi)].some(m => !/\bsrc\s*=\s*["']?\s*[^"'\s>]/i.test(m[0]));

// Complete iPhone model names: generation plus suffix ("iphone 14 pro max", "iphone 13 mini", "iphone 16e").
const IPHONE_MODEL = /\biphone (\d{1,2}e?|xs|xr|x|se)(?: (pro max|pro|plus|max|mini))?(?![a-z0-9])/g;
const iphoneModels = (text: string) => new Set([...` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `.matchAll(IPHONE_MODEL)].map(m => m[0].trim()));

/**
 * For iPhones: the description's headings name one or more iPhone models, but never the product's
 * own complete model (e.g. an "iPhone 14 Plus" page whose headings only speak of "iPhone 14", or an
 * "iPhone 14" page whose headings only name the "iPhone 14 Pro Max").
 */
export function mentionsOtherModel(title: string, html: string | null | undefined): boolean {
  const model = modelOf(title);
  const own = iphoneModels(model);
  // Only for titles whose model is exactly one recognised iPhone model.
  if (own.size !== 1 || !own.has(model)) return false;
  const mentioned = new Set([...(html ?? '').matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].flatMap(m => [...iphoneModels(textOf(m[1]))]));
  return mentioned.size > 0 && !mentioned.has(model);
}

/** Truly empty: no visible text and no images (a short text is never replaced automatically). */
export const isBlankDescription = (html: string | null | undefined) => !textOf(html) && !/<img\b/i.test(html ?? '');

/** The product name for SEO: without "Refurbished", stars and the trailing "M" code. */
export function seoName(title: string): string {
  return title.replace(/\brefurbished\b/gi, ' ').replace(/\b\d\s*\*/g, ' ').replace(/\s+M\s*$/, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\s+M$/, '').trim();
}

const conditionLabel = (title: string) => {
  const stars = starsOf(title);
  return stars && CONDITION[stars] ? CONDITION[stars].replace(/^\d\*\s*/, '') : null;
};

const cutAtWord = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > max * 0.6 ? cut.slice(0, i) : s.slice(0, max)).replace(/[\s,–|-]+$/, '');
};

/**
 * Suggested SEO title (max. 60 characters), in the shop's existing style; the most complete variant
 * that fits. Distinguishing properties (for products sharing a title) come right after the name and
 * are dropped last.
 */
export function suggestSeoTitle(title: string, refurbished: boolean, extras: string[] = []): string {
  const name = seoName(title);
  const cond = conditionLabel(title);
  const plain = refurbished ? `Refurbished ${name}` : name;
  const options: string[] = [];
  // All distinguishing properties, then only the first; with and without "Refurbished"; the plain name last.
  const sets = [extras, extras.slice(0, 1)].filter((x, i, all) => x.length && (i === 0 || x.length !== all[0].length)).map(x => x.join(' '));
  const bases = [...sets.flatMap(x => [`${plain} ${x}`, ...(refurbished ? [`${name} ${x}`] : [])]), plain];
  for (const base of bases) {
    if (refurbished) options.push(...(cond ? [`${base} – ${cond} | ${BRAND}`, `${base} – ${cond}`] : []), `${base} | ${BRAND}`, base);
    else options.push(`${base} kopen - ${BRAND}`, `${base} | ${BRAND}`, base);
  }
  return options.find(o => o.length <= SEO_TITLE_MAX) ?? cutAtWord(plain, SEO_TITLE_MAX);
}

const PICKUP = ['Gratis afhalen in Gentbrugge, Antwerpen & Oudenaarde of snelle levering in België.', 'Gratis afhalen of snelle levering in België.'];

/** Suggested meta description (max. 155 characters), only from facts the shop already states. No prices: they change. */
export function suggestSeoDescription(title: string, refurbished: boolean, warranty: string | null, extras: string[] = []): string {
  const name = seoName(title);
  const cond = conditionLabel(title);
  const w = warranty?.trim() ? `${warranty.trim()} garantie` : 'garantie';
  const withSpecs = extras.length ? ` met ${extras.join(' en ')}` : '';
  const leads = refurbished
    ? [`Koop refurbished ${name}${withSpecs}${cond ? ` in conditie ${cond}` : ''} bij ${BRAND} met ${w}.`, `Koop refurbished ${name}${withSpecs} bij ${BRAND} met ${w}.`, ...(withSpecs ? [`Refurbished ${name}${withSpecs} bij ${BRAND}.`] : [])]
    : [`Koop ${name}${withSpecs} bij ${BRAND} met garantie.`];
  // Condition and warranty matter more than the pickup sentence: a fuller lead without tail beats a shorter lead with one.
  for (const lead of leads) for (const tail of [...PICKUP, '']) { const t = tail ? `${lead} ${tail}` : lead; if (t.length <= SEO_DESCRIPTION_MAX) return t; }
  return cutAtWord(leads[leads.length - 1], SEO_DESCRIPTION_MAX);
}

/**
 * Description for a product without one: taken from a product of exactly the same model with a
 * substantial description (the longest wins). Null if there is none.
 */
export function pickDescription<T extends { title: string; descriptionHtml?: string | null }>(title: string, refs: T[]): T | null {
  const model = modelOf(title);
  if (!model) return null;
  let best: { ref: T; words: number } | null = null;
  for (const r of refs) {
    // Never copied: texts naming another model, or with hidden code or placeholders.
    if (modelOf(r.title) !== model || mentionsOtherModel(title, r.descriptionHtml) || isUnsafeDescription(r.descriptionHtml)) continue;
    const words = wordCount(r.descriptionHtml);
    if (words >= SHORT_DESCRIPTION_WORDS && (!best || words > best.words)) best = { ref: r, words };
  }
  return best?.ref ?? null;
}

/** Condition grades mentioned in a text: stars ("4*") and the Dutch labels. */
export function conditionMentions(text: string): Set<string> {
  const t = ` ${text.toLowerCase()} `;
  const out = new Set<string>([...t.matchAll(/\b([345])\s*\*/g)].map(m => m[1]));
  if (/\bals nieuw\b/.test(t)) out.add('5');
  if (/\bzeer goed\b/.test(t)) out.add('4');
  // "Goed" alone is a common word; only "conditie goed" counts as the 3* label.
  if (/\bconditie goed\b/.test(t)) out.add('3');
  return out;
}

/** The SEO text names a condition that does not match the stars in the product title. */
export function seoConditionMismatch(title: string, seoTitle: string, seoDescription: string): boolean {
  const stars = starsOf(title);
  if (!stars || !CONDITION[stars]) return false;
  const mentioned = conditionMentions(`${seoTitle} ${seoDescription}`);
  return [...mentioned].some(g => g !== stars);
}

/**
 * The SEO text is the raw product title (stars, condition code), or, for a refurbished product,
 * TinySEO's generic "… kopen - Microforce" template. For other products that form is the shop style.
 */
export const seoIsRaw = (seoTitle: string, seoDescription: string, refurbished: boolean) =>
  /\b\d\s*\*/.test(`${seoTitle} ${seoDescription}`) || (refurbished && / kopen - Microforce$/i.test(seoTitle.trim()));

/** Marker on headings our tool demoted from h1 to h2, so the change can be undone exactly. */
export const DEMOTED_H1_ATTR = 'data-mf-h1';

/**
 * Every <h1> in a description becomes a <h2> marked with this fix's token (the theme already shows
 * the title as the page's H1). The token ties each heading to one fix, so undo touches only its own.
 */
export function demoteH1(html: string, token: string): { html: string; count: number } {
  if (!/^[a-z0-9-]{4,40}$/i.test(token)) throw new Error('Ongeldige markering.');
  let count = 0;
  const out = html
    .replace(/<h1(\s[^>]*)?>/gi, (_m, attrs: string | undefined) => { count++; return `<h2 ${DEMOTED_H1_ATTR}="${token}"${attrs ?? ''}>`; })
    .replace(/<\/h1\s*>/gi, '</h2>');
  return { html: out, count };
}

/** Undo of demoteH1: only the headings carrying this fix's token become <h1> again. */
export function restoreH1(html: string, token: string): { html: string; count: number } {
  if (!/^[a-z0-9-]{4,40}$/i.test(token)) return { html, count: 0 };
  let count = 0;
  const re = new RegExp(`<h2 ${DEMOTED_H1_ATTR}="${token}"(\\s[^>]*)?>([\\s\\S]*?)<\\/h2\\s*>`, 'gi');
  const out = html.replace(re, (_m, attrs: string | undefined, inner: string) => { count++; return `<h1${attrs ?? ''}>${inner}</h1>`; });
  return { html: out, count };
}

// ── Pasted (AI) text: hidden code, placeholders and promises to check ──────────────────────────────

const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
/** Company-name placeholders left in pasted texts; replaced by the shop name. */
const NAME_PLACEHOLDER = /\[(?:bedrijfsnaam|bedrijf|winkelnaam|webshopnaam|webshop|shopnaam|naam bedrijf|company name|company|store name|shop name)\]/gi;
/** Other placeholders in the visible text ("[Stad]", "uwdomein.nl", "lorem ipsum"): reported, never replaced. */
const OTHER_PLACEHOLDER = /\[[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\-]{1,38}\]|\b(?:uw|jouw)domein\.|\bexample\.(?:com|nl|be)\b|\blorem ipsum\b/i;
/** Promises a pasted text makes on behalf of the shop that someone should check. */
const CLAIMS = /\bbatterij\w* (?:conditie |capaciteit )?van (?:minimaal|minstens)\b|\b\d+\s*kg (?:aan )?co2/i;
/** CSS that is shown as text (a rule like ".x { color: red; }" outside a <style> tag). */
const CSS_AS_TEXT = /(?:^|\s)[.#]?[a-z][\w-]*(?:\s+[.#]?[\w-]+)*\s*\{[^{}]*:[^{}]*;?\s*\}/i;

/** Number of <script> blocks (e.g. JSON-LD) in a description: Google reads them as extra product data. */
export const scriptCount = (html: string | null | undefined) => ((html ?? '').match(/<script\b/gi) ?? []).length;
const withoutScripts = (html: string | null | undefined) => (html ?? '').replace(SCRIPT_BLOCK, ' ');
/** Company-name placeholders outside scripts. */
export const namePlaceholderCount = (html: string | null | undefined) => (withoutScripts(html).match(NAME_PLACEHOLDER) ?? []).length;
/** Any placeholder in the visible text (company name or other). */
export const hasPlaceholder = (html: string | null | undefined) => { const t = textOf(html); return new RegExp(NAME_PLACEHOLDER.source, 'i').test(t) || OTHER_PLACEHOLDER.test(t); };
export const hasClaims = (html: string | null | undefined) => CLAIMS.test(textOf(html));
export const hasCssAsText = (html: string | null | undefined) => CSS_AS_TEXT.test(textOf((html ?? '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')));
/** A text that must never be copied to another product: hidden code or placeholders. */
export const isUnsafeDescription = (html: string | null | undefined) => scriptCount(html) > 0 || hasPlaceholder(html);

/** One change of cleanDescription, at a position in the cleaned text: undo puts `removed` back in place of `inserted`. */
export type DescriptionEdit = { at: number; removed: string; inserted: string };

/**
 * Removes <script> blocks and replaces company-name placeholders by the shop name. The edits are
 * recorded with their position in the result, so the exact original can be rebuilt (undoClean).
 */
export function cleanDescription(html: string): { html: string; edits: DescriptionEdit[]; scripts: number; names: number } {
  const re = new RegExp(`${SCRIPT_BLOCK.source}|${NAME_PLACEHOLDER.source}`, 'gi');
  const edits: DescriptionEdit[] = [];
  let out = '', last = 0, scripts = 0, names = 0;
  for (const m of html.matchAll(re)) {
    out += html.slice(last, m.index);
    const script = m[0].startsWith('<');
    if (script) scripts++; else names++;
    const inserted = script ? '' : BRAND;
    edits.push({ at: out.length, removed: m[0], inserted });
    out += inserted;
    last = (m.index ?? 0) + m[0].length;
  }
  return { html: out + html.slice(last), edits, scripts, names };
}

/** Rebuilds the original of cleanDescription; null when the text no longer matches the recorded edits. */
export function undoClean(html: string, edits: DescriptionEdit[]): string | null {
  let out = html;
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    if (!Number.isInteger(e.at) || e.at < 0 || out.slice(e.at, e.at + e.inserted.length) !== e.inserted) return null;
    out = out.slice(0, e.at) + e.removed + out.slice(e.at + e.inserted.length);
  }
  return out;
}

/** Fingerprint of the full HTML (FNV-1a, 32 bit), to check a text is still exactly what a fix wrote. */
export function htmlHash(html: string | null | undefined): string {
  const t = html ?? '';
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${t.length}:${h.toString(16)}`;
}
