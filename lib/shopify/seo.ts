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

/** Suggested SEO title (max. 60 characters), in the shop's existing style; the most complete variant that fits. */
export function suggestSeoTitle(title: string, refurbished: boolean): string {
  const name = seoName(title);
  const cond = conditionLabel(title);
  const base = refurbished ? `Refurbished ${name}` : name;
  const options = refurbished
    ? [...(cond ? [`${base} – ${cond} | ${BRAND}`, `${base} – ${cond}`] : []), `${base} | ${BRAND}`, base]
    : [`${name} kopen - ${BRAND}`, `${name} | ${BRAND}`, name];
  return options.find(o => o.length <= SEO_TITLE_MAX) ?? cutAtWord(base, SEO_TITLE_MAX);
}

const PICKUP = ['Gratis afhalen in Gentbrugge, Antwerpen & Oudenaarde of snelle levering in België.', 'Gratis afhalen of snelle levering in België.'];

/** Suggested meta description (max. 155 characters), only from facts the shop already states. No prices: they change. */
export function suggestSeoDescription(title: string, refurbished: boolean, warranty: string | null): string {
  const name = seoName(title);
  const cond = conditionLabel(title);
  const w = warranty?.trim() ? `${warranty.trim()} garantie` : 'garantie';
  const leads = refurbished
    ? [`Koop refurbished ${name}${cond ? ` in conditie ${cond}` : ''} bij ${BRAND} met ${w}.`, `Koop refurbished ${name} bij ${BRAND} met ${w}.`]
    : [`Koop ${name} bij ${BRAND} met garantie.`];
  for (const lead of leads) for (const tail of PICKUP) { const t = `${lead} ${tail}`; if (t.length <= SEO_DESCRIPTION_MAX) return t; }
  for (const lead of leads) if (lead.length <= SEO_DESCRIPTION_MAX) return lead;
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
    if (modelOf(r.title) !== model || mentionsOtherModel(title, r.descriptionHtml)) continue;
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

/** The SEO text is the raw product title (stars, condition code) or the generic "… kopen - Microforce" template. */
export const seoIsRaw = (seoTitle: string, seoDescription: string) =>
  /\b\d\s*\*/.test(`${seoTitle} ${seoDescription}`) || / kopen - Microforce$/i.test(seoTitle.trim());
