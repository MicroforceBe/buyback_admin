// SEO helpers for product pages (pure): text checks on the description, suggested SEO title and
// meta description, and the description a new draft takes over from a product of the same model.
import { CONDITION, modelOf, starsOf } from '@/lib/shopify/enrich';

export const SEO_TITLE_MAX = 60;
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

/**
 * For iPhones: the description's headings mention an iPhone, but never the product's own model
 * (e.g. an "iPhone 14 Plus" page whose headings only speak of "iPhone 14").
 */
export function mentionsOtherModel(title: string, html: string | null | undefined): boolean {
  const model = modelOf(title);
  if (!model.startsWith('iphone ')) return false;
  const headings = [...(html ?? '').matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => ` ${textOf(m[1]).toLowerCase().replace(/[^a-z0-9+]+/g, ' ')} `);
  if (!headings.some(h => h.includes(' iphone '))) return false;
  return !headings.some(h => h.includes(` ${model} `));
}

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
