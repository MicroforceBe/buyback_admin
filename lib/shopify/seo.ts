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
export const hasEmptyImage = (html: string | null | undefined) => emptyImageCount(html) > 0;

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

/**
 * The shop's promise for refurbished products, long and short form: "premium" only for condition 4* and 5*
 * (no visible wear); other grades, or no grade in the title, get "gecontroleerde kwaliteit".
 */
export function qualityLine(title: string): [string, string] {
  const stars = starsOf(title);
  const word = stars === '4' || stars === '5' ? 'Premium' : 'Gecontroleerde';
  return [`${word} kwaliteit aan een scherpe prijs.`, `${word} kwaliteit, scherpe prijs.`];
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
  // Condition and warranty matter most, then the quality line, then the pickup sentence: a fuller lead
  // without tail beats a shorter lead with one.
  const quality = refurbished ? qualityLine(title) : null;
  const tails = quality ? [...PICKUP.map(p => `${quality[0]} ${p}`), ...quality, ...PICKUP, ''] : [...PICKUP, ''];
  for (const lead of leads) for (const tail of tails) { const t = tail ? `${lead} ${tail}` : lead; if (t.length <= SEO_DESCRIPTION_MAX) return t; }
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
/** A <picture> element: its <img> can take the image from a <source>, so it is never treated as empty. */
const PICTURE = /<picture\b[\s\S]*?<\/picture\s*>/gi;
/** A complete <img> tag; quoted attribute values may contain ">". */
const IMG_TAG = `<img\\b(?:[^>"']|"[^"]*"|'[^']*')*>`;
/** An <img>, with its <p> when that holds nothing else; whether it is empty is decided by isEmptyImageTag. */
const IMAGE = new RegExp(`<p>\\s*${IMG_TAG}\\s*<\\/p>|${IMG_TAG}`, 'gi');
/** No source the browser (or a lazy loader) can show: src, srcset, data-src and data-srcset all missing or blank. */
function isEmptyImageTag(tag: string): boolean {
  const img = tag.match(new RegExp(IMG_TAG, 'i'))?.[0] ?? '';
  for (const m of img.slice(4, -1).matchAll(/([^\s"'=\/>]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
    if (['src', 'srcset', 'data-src', 'data-srcset'].includes(m[1].toLowerCase()) && (m[2] ?? '').replace(/^["']|["']$/g, '').trim()) return false;
  }
  return true;
}
/** Company-name placeholders left in pasted texts; replaced by the shop name. */
const NAME_PLACEHOLDER = /\[(?:bedrijfsnaam|bedrijf|winkelnaam|webshopnaam|webshop|shopnaam|naam bedrijf|company name|company|store name|shop name)\]/gi;
/** Other placeholders in the visible text ("[Stad]", "uwdomein.nl", "lorem ipsum"): reported, never replaced. */
const OTHER_PLACEHOLDER = /\[[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\-]{1,38}\]|\b(?:uw|jouw)domein\.|\bexample\.(?:com|nl|be)\b|\blorem ipsum\b/i;
/** Promises a pasted text makes on behalf of the shop that someone should check. */
const CLAIMS = /\bbatterij\w* (?:conditie |capaciteit )?van (?:minimaal|minstens)\b|\b(?:batterij|accu)\w*[^.<]{0,20}(?:>|≥|minimaal|minstens)\s*\d{2}\s*%|\b\d+\s*kg (?:aan )?co2/i;
/** CSS that is shown as text (a rule like ".x { color: red; }" outside a <style> tag). */
const CSS_AS_TEXT = /(?:^|\s)[.#]?[a-z][\w-]*(?:\s+[.#]?[\w-]+)*\s*\{[^{}]*:[^{}]*;?\s*\}/i;

/** Number of <script> blocks (e.g. JSON-LD) in a description: Google reads them as extra product data. */
export const scriptCount = (html: string | null | undefined) => ((html ?? '').match(/<script\b/gi) ?? []).length;
/** Images without a usable src outside scripts (the clean-up removes them). */
export const emptyImageCount = (html: string | null | undefined) => [...withoutScripts(html).replace(PICTURE, ' ').matchAll(IMAGE)].filter(m => isEmptyImageTag(m[0])).length;
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
 * Removes <script> blocks and images without a src, and replaces company-name placeholders by the shop name. The edits are
 * recorded with their position in the result, so the exact original can be rebuilt (undoClean).
 */
export function cleanDescription(html: string): { html: string; edits: DescriptionEdit[]; scripts: number; names: number; images: number } {
  const re = new RegExp(`${SCRIPT_BLOCK.source}|${PICTURE.source}|${IMAGE.source}|${NAME_PLACEHOLDER.source}`, 'gi');
  const edits: DescriptionEdit[] = [];
  let out = '', last = 0, scripts = 0, names = 0, images = 0;
  for (const m of html.matchAll(re)) {
    out += html.slice(last, m.index);
    last = (m.index ?? 0) + m[0].length;
    // A <picture>, or an image with a source, stays; scripts and company-name placeholders inside it are still handled.
    if (/^<picture\b/i.test(m[0]) || (/^<(p|img)\b/i.test(m[0]) && !isEmptyImageTag(m[0]))) {
      let kept = 0;
      for (const n of m[0].matchAll(new RegExp(`${SCRIPT_BLOCK.source}|${NAME_PLACEHOLDER.source}`, 'gi'))) {
        out += m[0].slice(kept, n.index);
        const isName = !n[0].startsWith('<');
        if (isName) names++; else scripts++;
        edits.push({ at: out.length, removed: n[0], inserted: isName ? BRAND : '' });
        out += isName ? BRAND : '';
        kept = (n.index ?? 0) + n[0].length;
      }
      out += m[0].slice(kept);
      continue;
    }
    const name = !m[0].startsWith('<');
    if (name) names++; else if (/^<script/i.test(m[0])) scripts++; else images++;
    const inserted = name ? BRAND : '';
    edits.push({ at: out.length, removed: m[0], inserted });
    out += inserted;
  }
  return { html: out + html.slice(last), edits, scripts, names, images };
}

/** Rebuilds the original of cleanDescription; null when the text no longer matches the recorded edits. */
export function undoClean(html: string, edits: DescriptionEdit[]): string | null {
  let out = html;
  // Last edit first: edits are recorded in text order, and several can share a position (adjacent scripts).
  let prev = Infinity;
  for (const e of [...edits].reverse()) {
    if (e.at > prev) return null;
    prev = e.at;
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

// ── Alt texts: product photos and images in the description ────────────────────────────────────────

export const ALT_MAX = 125;
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Alt text for a product photo or a description image: what is on it (no stars, no shop slogan). */
export function altText(title: string, refurbished: boolean, n: number, of: number, word: 'foto' | 'afbeelding' = 'foto'): string {
  const base = cutAtWord(refurbished ? `Refurbished ${seoName(title)}` : seoName(title), ALT_MAX - 15);
  return of > 1 && n > 1 ? `${base} – ${word} ${n}` : base;
}

/**
 * A weak alt text: TinySEO's generic template (stars, "kopen bij Microforce", the pickup slogan) or longer
 * than an alt text should be. It describes the shop, not what is on the photo.
 */
export const altIsWeak = (alt: string | null | undefined) => {
  const a = (alt ?? '').trim();
  return !!a && (/\b\d\s*\*/.test(a) || /kopen bij microforce|gratis afhalen|apple-specialist|refurbished expert/i.test(a) || a.length > ALT_MAX);
};

/** Position and current alt of every <img> with a source (outside scripts); images inside <picture> included. */
function describedImages(html: string): { start: number; tag: string; alt: { index: number; text: string; value: string } | null }[] {
  const out: { start: number; tag: string; alt: { index: number; text: string; value: string } | null }[] = [];
  for (const m of html.matchAll(new RegExp(`${SCRIPT_BLOCK.source}|${IMG_TAG}`, 'gi'))) {
    if (/^<script/i.test(m[0]) || isEmptyImageTag(m[0])) continue;
    let alt: { index: number; text: string; value: string } | null = null;
    for (const a of m[0].slice(4, -1).matchAll(/([^\s"'=\/>]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
      if (a[1].toLowerCase() === 'alt') { alt = { index: 4 + (a.index ?? 0), text: a[0], value: (a[2] ?? '').replace(/^["']|["']$/g, '').trim() }; break; }
    }
    out.push({ start: m.index ?? 0, tag: m[0], alt });
  }
  return out;
}

/** Images with a source in the description whose alt text is missing or blank. */
export const descriptionAltMissingCount = (html: string | null | undefined) => describedImages(html ?? '').filter(i => !i.alt?.value).length;

/**
 * Gives every image in the description without an alt text one (the product name, numbered when there
 * are several). Existing alt texts stay. Edits in the same form as cleanDescription, so undoClean rebuilds the original.
 */
export function addDescriptionAlts(html: string, title: string, refurbished: boolean): { html: string; edits: DescriptionEdit[]; images: number } {
  const missing = describedImages(html).filter(i => !i.alt?.value);
  const edits: DescriptionEdit[] = [];
  let out = '', last = 0, n = 0;
  for (const img of missing) {
    n++;
    const attr = `alt="${escapeAttr(altText(title, refurbished, n, missing.length, 'afbeelding'))}"`;
    // A blank alt attribute is replaced; a missing one is added right after "<img".
    const at = img.alt ? img.start + img.alt.index : img.start + 4;
    const removed = img.alt ? img.alt.text : '';
    const inserted = img.alt ? attr : ` ${attr}`;
    out += html.slice(last, at);
    edits.push({ at: out.length, removed, inserted });
    out += inserted;
    last = at + removed.length;
  }
  return { html: out + html.slice(last), edits, images: missing.length };
}
