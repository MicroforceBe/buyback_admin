// Fills product properties (metafields) of a new draft from its title and from the most similar
// existing products. Pure; the caller fetches the reference products' metafields.
//
// Rules:
//  - Uiterlijk (magento.conditie) comes from the stars in the title ("5*" -> "5* Als Nieuw").
//  - "Wat mag je verwachten" is copied from a product in the same SKU family with the same stars.
//  - Colour fields only from a reference with the same colour in its title (SG = Space Grey, ...).
//  - Model = the title words before the first capacity ("MacBook Pro 16 L21 M1 Max", "iPhone 13 Mini").
//    Model properties (screen, processor, camera, ...) only from a reference with exactly the same model.
//  - Memory/storage fields only from a reference with the same model and the same capacities;
//    without such a reference they are read from the title ("16GB 1TB SSD" -> 16 GB werkgeheugen, 1 TB SSD).
//  - Never copied: fields the ERP syncs, stock/price fields and app data (reviews, SEO, ...).

export type MetafieldValue = { namespace: string; key: string; type: string; value: string };
export type RefImage = { url: string; width: number | null; height: number | null; altText: string | null };
export type Reference = { sku: string; title: string; lead: number; metafields: MetafieldValue[]; images?: RefImage[] };

// Marketing quality: longest side at least 1000 px, shortest at least 500 px, not a strip (max 3:1).
export const MIN_LONG_SIDE = 1000;
export const MIN_SHORT_SIDE = 500;
export const MAX_ASPECT = 3;
export const MAX_IMAGES = 10;

export function goodImage(i: RefImage): boolean {
  if (!i.url || !i.width || !i.height) return false;
  const long = Math.max(i.width, i.height), short = Math.min(i.width, i.height);
  return long >= MIN_LONG_SIDE && short >= MIN_SHORT_SIDE && long / short <= MAX_ASPECT;
}

/** Alt text for a copied image: the reference's alt with the new title, keeping the shop's SEO suffix. */
export function altFor(newTitle: string, refTitle: string, alt: string | null): string {
  if (alt && alt.includes(refTitle)) return alt.split(refTitle).join(newTitle).slice(0, 512);
  const i = alt ? alt.indexOf('kopen bij') : -1;
  return (i >= 0 ? `${newTitle} - ${alt!.slice(i)}` : newTitle).slice(0, 512);
}

/**
 * Images for a new draft: only from an existing product of exactly the same model and colour, and
 * only images of marketing quality. The reference with the most good images wins. Null if none.
 */
export function pickImages(title: string, refs: Reference[]): { files: { originalSource: string; contentType: 'IMAGE'; alt: string; duplicateResolutionMode: 'APPEND_UUID' }[]; fromSku: string } | null {
  const model = modelOf(title);
  if (!model) return null;
  const colourOf = (r: Reference) => r.metafields.find(m => `${m.namespace}.${m.key}` === 'magento.colour_of_product')?.value.trim().toLowerCase() ?? '';
  const known = [...new Set([...KNOWN_COLOURS, ...refs.map(colourOf).filter(Boolean)])];
  const mostSpecific = (t: string) => known.filter(c => sameColour(t, c)).sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length)[0];
  const titleColour = mostSpecific(title);
  // Same colour: by the colour field or by the reference's own title (many products lack the field).
  // A title without a colour (e.g. most laptops) only matches references whose title has none either.
  const sameColourAs = (r: Reference) => titleColour
    ? colourOf(r) === titleColour || mostSpecific(r.title) === titleColour
    : !mostSpecific(r.title) && !colourOf(r);
  let best: { ref: Reference; good: RefImage[] } | null = null;
  for (const r of refs) {
    if (modelOf(r.title) !== model || !sameColourAs(r)) continue;
    const good = (r.images ?? []).filter(goodImage);
    if (good.length && (!best || good.length > best.good.length)) best = { ref: r, good };
  }
  if (!best) return null;
  return {
    fromSku: best.ref.sku,
    files: best.good.slice(0, MAX_IMAGES).map(i => ({ originalSource: i.url, contentType: 'IMAGE' as const, alt: altFor(title, best!.ref.title, i.altText), duplicateResolutionMode: 'APPEND_UUID' as const })),
  };
}

export const CONDITION: Record<string, string> = { '5': '5* Als Nieuw', '4': '4* Zeer Goed', '3': '3* Goed' };

const EXCLUDED_NAMESPACES = ['judgeme', 'global', 'reviews', 'mm-google-shopping'];
const EXCLUDED = new Set([
  'custom.refurbished_product', 'custom.vat_margin', 'magento.manufacturer', 'magento.tax_bebat', 'magento.tax_recupel', // synced from the ERP
  'custom.stock_per_location_1', 'magento.stock_antwerpen', 'magento.stock_gentbrugge', 'magento.stock_oudenaarde', 'custom.dealer_price',
]);
const COLOUR = new Set(['magento.colour_of_product', 'custom.color_swatch', 'shopify.color-pattern', 'magento.smartwatchcolorcase']);
const CAPACITY = new Set(['magento.internal_memory', 'magento.internal_storage_capacity', 'magento.solid_state_drive_capacity', 'magento.discrete_graphics_adapter_mem']);
const BY_STARS = new Set(['custom.wat_mag_je_verwachten_']);
const CONDITION_FIELD = 'magento.conditie';
/**
 * Fields that are the same for every chip variant of one Mac housing (e.g. MacBook Pro 14" L24 with M4,
 * M4 Pro or M4 Max). Used only when no product of exactly the same model exists. USB-C is left out:
 * the number of ports can differ per chip (MacBook Pro 14" M3: 2, M3 Pro/Max: 3).
 */
const CHASSIS = new Set(['magento.modeljaar', 'magento.modelmacbook', 'magento.display_resolution', 'magento.display_diagonal', 'magento.hdmi_ports_quantity', 'magento.garantie']);
const MAC = /\b(macbook|imac|mac mini|mac studio)\b/;

/** The housing of an Apple-silicon Mac model: the chip variant (Pro, Max, Ultra after M1–M9) removed. "" for other devices. */
export function chassisOf(title: string): string {
  if (!MAC.test(title.toLowerCase())) return '';
  const words = modelOf(title).split(' ');
  return words.filter((w, i) => !(/^(pro|max|ultra)$/.test(w) && i > 0 && /^m\d$/.test(words[i - 1]))).join(' ');
}

/** Processor family of an Apple-silicon Mac from its title ("… M4 Max 36GB …" → "Apple M4 Max"), or null. */
export function macChipFamily(title: string): string | null {
  if (!MAC.test(title.toLowerCase())) return null;
  const m = title.match(/\bM(\d)(?:[\s-]+(Pro|Max|Ultra))?\b/i);
  if (!m) return null;
  const variant = m[2] ? ' ' + m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : '';
  return `Apple M${m[1]}${variant}`;
}

const id = (m: { namespace: string; key: string }) => `${m.namespace}.${m.key}`;
// Multi-word colours, so a title with "Rose Gold" is never matched to a "Gold" reference even when
// no Rose Gold reference is available. Colours of the reference products are added at run time.
const KNOWN_COLOURS = ['rose gold', 'space grey', 'space gray', 'space black', 'pacific blue', 'sierra blue', 'alpine green', 'midnight green',
  'deep purple', 'jet black', 'light gold', 'sky blue', 'mist blue', 'deep blue', 'cosmic orange', 'cloud white',
  'natural titanium', 'black titanium', 'white titanium', 'blue titanium', 'desert titanium', 'product red',
  'onyx black', 'marble grey', 'cobalt violet', 'amber yellow', 'phantom black', 'cream', 'lavender', 'mint',
  // single-word colours, so a title like "iPhone 13 128GB Blue" is recognised as coloured
  'black', 'white', 'silver', 'gold', 'blue', 'red', 'green', 'pink', 'purple', 'yellow', 'graphite', 'midnight',
  'starlight', 'grey', 'gray', 'orange', 'coral', 'violet', 'bronze', 'titanium'];
// Every word of a known colour ("space", "grey", "rose", ...): never part of a model without capacities.
const COLOUR_WORDS = new Set(KNOWN_COLOURS.flatMap(c => c.split(' ')));
const COLOUR_ALIASES: Record<string, string> = { sg: 'space grey', sb: 'space black', sl: 'silver', gd: 'gold', spacegrey: 'space grey', 'space-grey': 'space grey' };

// Computers: a title with two capacities is "werkgeheugen + SSD" ("16GB 1TB SSD", "8GB 256SSD").
const COMPUTER = /\b(macbook|imac|mac\s*mini|mac\s*studio|laptop|latitude|precision|vostro|elitebook|probook|zbook|thinkpad|ideapad|surface)\b/i;
const MAX_RAM_GB = 192;

/**
 * Memory/storage fields read from the title itself, used only when no existing product of the same
 * model has the same capacities. Computers: RAM = the capacity without "SSD", SSD = the capacity with
 * "SSD" (or the second of two). Phones and tablets: one capacity = storage. Ambiguous titles give nothing.
 */
export function capacityFieldsFromTitle(title: string): MetafieldValue[] {
  const toks = [...title.matchAll(/(\d+)\s*(gb|tb)(?:\s*(ssd))?\b|(\d+)\s*(ssd)\b/gi)].map(m => m[1]
    ? { n: Number(m[1]), unit: m[2].toUpperCase(), ssd: !!m[3] }
    : { n: Number(m[4]), unit: 'GB', ssd: true });
  const field = (key: string, t: { n: number; unit: string }): MetafieldValue => ({ namespace: 'magento', key, type: 'single_line_text_field', value: `${t.n} ${t.unit}` });
  if (!toks.length) return [];
  if (COMPUTER.test(title) || toks.some(t => t.ssd)) {
    let ssd = toks.find(t => t.ssd);
    if (!ssd && toks.length === 2) ssd = toks[1];
    const ram = toks.find(t => t !== ssd && t.unit === 'GB' && t.n <= MAX_RAM_GB);
    const out: MetafieldValue[] = [];
    if (ram && ssd) out.push(field('internal_memory', ram));
    if (ssd && (ram || toks.length === 1)) out.push(field('solid_state_drive_capacity', ssd));
    return out;
  }
  return toks.length === 1 ? [field('internal_storage_capacity', toks[0])] : [];
}

export function starsOf(title: string): string | null {
  const all = [...title.matchAll(/(\d)\s*\*/g)];
  return all.length ? all[all.length - 1][1] : null;
}

/** Capacities in a title, normalised: "16GB 512SSD" -> {16gb, 512gb}; "1TB SSD" / "1TBSSD" -> {1tb}. */
export function capacitiesOf(title: string): string {
  const s = title.toLowerCase().replace(/tb\s*ssd/g, 'tb').replace(/(\d+)\s*ssd/g, '$1gb');
  return [...new Set([...s.matchAll(/(\d+)\s*(gb|tb)\b/g)].map(m => m[1] + m[2]))].sort().join(',');
}

const CAPACITY_TOKEN = /^\d+(gb|tb|ssd|tbssd)$/;
const NON_MODEL = new Set(['refurbished', 'refurb', 'nieuw', 'new', 'm', 'qwerty', 'azerty']);

/**
 * The model part of a title: the words before the first capacity token, or, without capacities,
 * all words except stars, colour codes and condition words. Lower case, quotes removed.
 */
export function modelOf(title: string): string {
  // Remove condition stars before punctuation is stripped; keep numeric model generations.
  // Hyphens count as spaces, so "M1-Max" and "M1 Max" are the same model.
  let words = title.toLowerCase().replace(/\b\d+\s*\*/g, ' ').replace(/[^a-z0-9.+]+/g, ' ').trim().split(' ').filter(Boolean);
  // Every Galaxy S, Z and Note is 5G, so "Galaxy S25 5G" and "Galaxy S25" are one model (Olivier, 25/11). The A series keeps
  // 5G apart: there the 4G and 5G versions are different devices.
  const gi = words.indexOf('galaxy');
  if (gi >= 0 && /^(s\d|z|note)/.test(words[gi + 1] ?? '')) words = words.filter(w => w !== '5g');
  const cut = words.findIndex(w => CAPACITY_TOKEN.test(w));
  if (cut > 0) return words.slice(0, cut).join(' ');
  return words.filter(w => !COLOUR_ALIASES[w] && !COLOUR_WORDS.has(w) && !NON_MODEL.has(w)).join(' ');
}

/** The descriptive words after the model (usually the colour), for choosing photo candidates. */
export function descriptiveWords(title: string): Set<string> {
  const model = new Set(modelOf(title).split(' '));
  const out = new Set<string>();
  for (const w of titleWords(title)) if (!model.has(w) && !CAPACITY_TOKEN.test(w) && !/^\d+$/.test(w) && !NON_MODEL.has(w)) out.add(w);
  return out;
}

/**
 * Photo candidates, independent of the metafield cut-off: products of exactly the same model,
 * those sharing descriptive (colour) words first.
 */
export function photoCandidates<T extends { title: string }>(title: string, ranked: T[], max = 10): T[] {
  const model = modelOf(title);
  if (!model) return [];
  const words = descriptiveWords(title);
  const same = ranked.filter(r => modelOf(r.title) === model);
  const shares = (r: T) => [...descriptiveWords(r.title)].some(w => words.has(w));
  return [...same.filter(shares), ...same.filter(r => !shares(r))].slice(0, max);
}

function titleWords(title: string): Set<string> {
  const words = title.toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(' ').filter(Boolean);
  const out = new Set(words);
  for (let i = 0; i < words.length; i++) {
    const alias = COLOUR_ALIASES[words[i]];
    if (alias) for (const w of alias.split(' ')) out.add(w);
  }
  return out;
}

/** True when every word of the colour value (e.g. "Space Grey") occurs in the title (SG counts as space grey). */
export function sameColour(title: string, colourValue: string): boolean {
  const words = colourValue.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (!words.length) return false;
  const t = titleWords(title);
  return words.every(w => t.has(w));
}

/**
 * refs must be ordered from most to least similar (same SKU family). Returns the metafields to set
 * and, per field, the SKU it was taken from (or "titel").
 */
export function enrichMetafields(title: string, refs: Reference[]): { metafields: MetafieldValue[]; sources: Record<string, string> } {
  const out = new Map<string, MetafieldValue>();
  const sources: Record<string, string> = {};
  // Legacy untyped values ('string', 'integer', 'json_string') cannot be written with productSet.
  const usable = (m: MetafieldValue) => m.value !== '' && !['string', 'integer', 'json_string'].includes(m.type) && !EXCLUDED.has(id(m)) && !EXCLUDED_NAMESPACES.includes(m.namespace) && !m.namespace.startsWith('shopify--');
  const set = (m: MetafieldValue, from: string) => { if (!out.has(id(m))) { out.set(id(m), { namespace: m.namespace, key: m.key, type: m.type, value: m.value }); sources[id(m)] = from; } };

  const stars = starsOf(title);
  if (stars && CONDITION[stars]) set({ namespace: 'magento', key: 'conditie', type: 'single_line_text_field', value: CONDITION[stars] }, 'titel');

  const capacities = capacitiesOf(title);
  const model = modelOf(title);
  const sameModel = refs.filter(r => model !== '' && modelOf(r.title) === model);
  // The title's colour is the most specific known colour it contains ("Rose Gold" beats "Gold");
  // only a reference with exactly that colour gives the colour fields.
  const colourOf = (r: Reference) => r.metafields.find(m => id(m) === 'magento.colour_of_product')?.value.trim().toLowerCase() ?? '';
  const known = [...new Set([...KNOWN_COLOURS, ...refs.map(colourOf).filter(Boolean)])];
  const mostSpecific = (t: string) => known.filter(c => sameColour(t, c)).sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length || b.length - a.length)[0];
  const titleColour = mostSpecific(title);
  // Same colour by the colour field or by the reference's own title (most products only have the
  // Color Swatch). The swatch can differ per model (iPhone 15 Yellow vs 15 Plus Yellow), so a
  // reference of the same model wins, and a reference with a swatch wins over one without.
  const colourMatches = titleColour ? refs.filter(r => colourOf(r) === titleColour || mostSpecific(r.title) === titleColour) : [];
  const hasSwatch = (r: Reference) => r.metafields.some(m => id(m) === 'custom.color_swatch' && m.value !== '');
  const colourRef = [...colourMatches].sort((a, b) =>
    Number(model !== '' && modelOf(b.title) === model) - Number(model !== '' && modelOf(a.title) === model) || Number(hasSwatch(b)) - Number(hasSwatch(a)))[0];
  const capacityRef = capacities ? sameModel.find(r => capacitiesOf(r.title) === capacities) : undefined;
  const starsRef = stars ? refs.find(r => starsOf(r.title) === stars) : undefined;
  const modelRef = sameModel[0];

  for (const m of colourRef?.metafields ?? []) if (COLOUR.has(id(m)) && usable(m)) set(m, colourRef!.sku);
  for (const m of capacityRef?.metafields ?? []) if (CAPACITY.has(id(m)) && usable(m)) set(m, capacityRef!.sku);
  // No product with the same model and capacities: read memory/storage from the title.
  if (!capacityRef) for (const m of capacityFieldsFromTitle(title)) set(m, 'titel');
  for (const m of starsRef?.metafields ?? []) if (BY_STARS.has(id(m)) && usable(m)) set(m, starsRef!.sku);
  for (const m of modelRef?.metafields ?? []) {
    const k = id(m);
    if (k === CONDITION_FIELD || COLOUR.has(k) || CAPACITY.has(k) || BY_STARS.has(k) || !usable(m)) continue;
    set(m, modelRef!.sku);
  }
  // First of its model (e.g. the first MacBook Pro 14" M4 Max): housing fields from another chip variant
  // of the same housing, and the processor family from the title.
  if (!modelRef) {
    const chassis = chassisOf(title);
    const chassisRef = chassis ? refs.find(r => chassisOf(r.title) === chassis) : undefined;
    for (const m of chassisRef?.metafields ?? []) if (CHASSIS.has(id(m)) && usable(m)) set(m, chassisRef!.sku);
    const family = macChipFamily(title);
    if (family) set({ namespace: 'magento', key: 'processor_family', type: 'single_line_text_field', value: family }, 'titel');
  }
  return { metafields: [...out.values()], sources };
}
