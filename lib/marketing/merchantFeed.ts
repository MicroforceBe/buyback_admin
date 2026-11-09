// Own Google Merchant Center feed (replaces Channable): Shopify products -> Merchant API product inputs.
// Pure functions only (no network); the run lives in merchantFeedRun.ts. Only refurbished products that are
// active and visible in the webshop go to Google. One offer per Shopify variant; the offer ID is the numeric
// variant ID, the same ID Channable used, so Google Ads keeps the history per product.
import { createHash } from 'node:crypto';

export const CONTENT_LANGUAGE = 'nl';
export const FEED_LABEL = 'BE';
export const COUNTRY = 'BE';
export const CURRENCY = 'EUR';
/** Test offers get this prefix and are kept away from every Google surface. */
export const TEST_PREFIX = 'test-';
export const TEST_EXCLUDED_DESTINATIONS = ['SHOPPING_ADS', 'DISPLAY_ADS', 'LOCAL_INVENTORY_ADS', 'FREE_LISTINGS', 'FREE_LOCAL_LISTINGS', 'YOUTUBE_SHOPPING'];

export const FEED_PRODUCTS = `query FeedProducts($after: String) {
  products(first: 10, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes { ...FeedProduct }
  }
}
${feedFragment()}`;

export const FEED_PRODUCTS_BY_ID = `query FeedProductsById($ids: [ID!]!) {
  nodes(ids: $ids) { ... on Product { ...FeedProduct } }
}
${feedFragment()}`;

function feedFragment() {
  return `fragment FeedProduct on Product {
  id legacyResourceId title status vendor productType descriptionHtml onlineStoreUrl category { name fullName }
  refurbished: metafield(namespace: "custom", key: "refurbished_product") { value }
  manufacturer: metafield(namespace: "magento", key: "manufacturer") { value }
  media(first: 10) { nodes { ... on MediaImage { image { url } } } }
  variants(first: 5) { pageInfo { hasNextPage endCursor } nodes { ...FeedVariant } }
}
${variantFragment()}`;
}

function variantFragment() {
  return `fragment FeedVariant on ProductVariant { id legacyResourceId title sku barcodes(first: 2) { nodes { value } } price compareAtPrice inventoryQuantity sellableOnlineQuantity
  inventoryItem { id inventoryLevels(first: 5) { pageInfo { hasNextPage endCursor } nodes { ...FeedLevel } } } }
fragment FeedLevel on InventoryLevel { location { id } quantities(names: ["available"]) { name quantity } }`;
}

/** The stock levels after the first page, for an item stocked at more than 5 locations. */
export const FEED_MORE_LEVELS = `query FeedMoreLevels($id: ID!, $after: String) {
  inventoryItem(id: $id) { inventoryLevels(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ...FeedLevel } } }
}
fragment FeedLevel on InventoryLevel { location { id } quantities(names: ["available"]) { name quantity } }`;

/** The variants after the first page, for the rare product with more than 5. */
export const FEED_MORE_VARIANTS = `query FeedMoreVariants($id: ID!, $after: String) {
  product(id: $id) { variants(first: 50, after: $after) { pageInfo { hasNextPage endCursor } nodes { ...FeedVariant } } }
}
${variantFragment()}`;

export type FeedLevel = { location: { id: string }; quantities: { name: string; quantity: number }[] };
export type FeedVariant = { id: string; legacyResourceId: string; title: string; sku: string | null; barcodes: { nodes: { value: string }[] }; price: string; compareAtPrice: string | null; inventoryQuantity: number | null; sellableOnlineQuantity?: number | null;
  inventoryItem?: { id?: string; inventoryLevels: { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedLevel[] } } | null;
};
export type FeedProduct = {
  id: string; legacyResourceId: string; title: string; status: string; vendor: string | null; productType: string | null; descriptionHtml: string | null; onlineStoreUrl: string | null;
  category: { name: string; fullName: string } | null;
  refurbished: { value: string } | null; manufacturer: { value: string } | null;
  media: { nodes: ({ image?: { url: string } | null } | null)[] };
  variants: { pageInfo?: { hasNextPage: boolean; endCursor: string | null }; nodes: FeedVariant[] };
};

type Price = { amountMicros: string; currencyCode: string };
export type ProductInput = {
  offerId: string; contentLanguage: string; feedLabel: string;
  productAttributes: {
    title: string; description: string; link: string; imageLink: string; additionalImageLinks?: string[];
    availability: 'IN_STOCK' | 'OUT_OF_STOCK'; price: Price; condition: 'REFURBISHED';
    brand?: string; gtins?: string[]; identifierExists?: boolean; googleProductCategory?: string; productTypes?: string[]; itemGroupId?: string;
    color?: string; productHighlights?: string[]; productDetails?: { sectionName: string; attributeName: string; attributeValue: string }[];
    customLabel0: string; customLabel1: string; customLabel2: string; customLabel3: string; customLabel4: string;
    excludedDestinations?: string[];
  };
};
export type LocalInventory = { storeCode: string; localInventoryAttributes: { availability: 'IN_STOCK' | 'OUT_OF_STOCK'; quantity: string } };
/** local: the stock per store (only stores with a store code); localHash '' when there is none. */
export type FeedOffer = { productId: string; input: ProductInput; hash: string; local: LocalInventory[]; localHash: string };
/** Shopify location ID -> Google Business Profile store code. */
export type StoreCodes = Record<string, string>;

/** Stock per store for one variant, for the stores that have a store code; sorted for a stable hash. */
export function localInventories(v: FeedVariant, storeCodes: StoreCodes): LocalInventory[] {
  const out: LocalInventory[] = [];
  for (const level of v.inventoryItem?.inventoryLevels.nodes ?? []) {
    const code = storeCodes[level.location.id];
    if (!code) continue;
    const qty = Math.max(0, level.quantities.find(q => q.name === 'available')?.quantity ?? 0);
    out.push({ storeCode: code, localInventoryAttributes: { availability: qty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK', quantity: String(qty) } });
  }
  return out.sort((a, b) => a.storeCode.localeCompare(b.storeCode));
}

const localHashOf = (local: LocalInventory[]) => local.length ? createHash('sha256').update(JSON.stringify(local)).digest('hex').slice(0, 32) : '';
export type Skip = { productId: string; title: string; reason: string };

const micros = (s: string) => String(Math.round(Number(s) * 1_000_000));
const isPositive = (s: string | null | undefined) => s != null && Number.isFinite(Number(s)) && Number(s) > 0;

/** Plain text from Shopify HTML: no tags, scripts or styles; entities decoded; at most 5000 characters. */
export function plainText(html: string | null | undefined): string {
  const text = (html ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.slice(0, 5000);
}

/** A barcode is only sent as GTIN when it is 8, 12, 13 or 14 digits with a valid check digit. */
export function validGtin(code: string | null | undefined): string | null {
  const c = (code ?? '').trim();
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(c) || /^0+$/.test(c)) return null;
  const digits = c.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? c : null;
}

/** Quality from the title ("… 5* …"), the same rule the ERP texts use. */
export function starsOf(title: string): string | null {
  const all = [...title.matchAll(/(\d)\s*\*/g)];
  return all.length ? all[all.length - 1][1] : null;
}

export function priceBand(euros: number): string {
  if (euros < 200) return 'tot 200';
  if (euros < 500) return '200-499';
  if (euros < 1000) return '500-999';
  return '1000+';
}

export function stockBand(qty: number): string {
  if (qty <= 0) return 'uitverkocht';
  if (qty === 1) return 'laatste stuk';
  return 'meerdere';
}

/**
 * Brand from the ERP manufacturer field ("APPLE" -> "Apple", "HP" stays "HP"). The Shopify vendor is the
 * shop itself for every product, so it is only used when it is not Microforce. OEM/unknown is no brand.
 */
export function brandOf(manufacturer: string | null | undefined, vendor: string | null | undefined): string | undefined {
  const tidy = (raw: string) => {
    const v = raw.trim().replace(/\s+/g, ' ');
    if (!v || /^(oem|onbekend|unknown|n\/?a|-)$/i.test(v)) return undefined;
    return v === v.toUpperCase() && v.length > 3 ? v.toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase()) : v;
  };
  const m = tidy(manufacturer ?? '');
  if (m) return m;
  const v = (vendor ?? '').trim();
  return v && !/^microforce\b/i.test(v) ? tidy(v) : undefined;
}

/** Product kind for the product groups (custom label 0): from the title and the Shopify category. */
export function kindOf(title: string, category: string | null | undefined): string {
  const t = `${title} ${category ?? ''}`.toLowerCase();
  if (/smart ?watch|apple watch|galaxy watch/.test(t)) return 'Smartwatch';
  if (/\b(tablet|ipad|galaxy tab)\b/.test(t)) return 'Tablet';
  if (/\b(laptop|notebook|macbook|chromebook|latitude|thinkpad|elitebook|probook)\b/.test(t)) return 'Laptop';
  if (/\b(imac|mac mini|desktop|all-in-one|optiplex)\b/.test(t)) return 'Desktop';
  if (/\b(monitor|beeldscherm)\b/.test(t)) return 'Monitor';
  if (/\b(iphone|smartphone|gsm|galaxy|pixel)\b|mobile & smart phones/.test(t)) return 'Smartphone';
  return 'Accessoire/overig';
}

/** Google product category for the main product types; anything else is left to Google. */
export function googleCategory(kind: string): string | undefined {
  return ({ Smartphone: '267', Tablet: '4745', Laptop: '328', Desktop: '325', Monitor: '397' } as Record<string, string>)[kind];
}

// Colour names as they appear in the titles (longest first, so "Space Black" wins over "Black").
const COLORS = ['Natural Titanium', 'White Titanium', 'Black Titanium', 'Blue Titanium', 'Desert Titanium', 'Deep Purple', 'Space Black', 'Space Grey', 'Space Gray', 'Sierra Blue', 'Alpine Green', 'Pacific Blue', 'Marble Grey', 'Onyx Black', 'Rose Gold',
  'Midnight', 'Starlight', 'Graphite', 'Silver', 'Gold', 'Black', 'White', 'Blue', 'Green', 'Pink', 'Red', 'Purple', 'Yellow', 'Grey', 'Gray', 'Titanium', 'Beige']
  .sort((a, b) => b.length - a.length);

/** Colour from the title ("SG" is the shop's shorthand for Space Grey); undefined when not clear. */
export function colorOf(title: string): string | undefined {
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`, 'i').test(title)) return c;
  if (/\bSG\b/.test(title)) return 'Space Grey';
  return undefined;
}

/**
 * Storage and memory from the title. Phones, tablets and watches: the first "128GB" is the storage.
 * Laptops/desktops: "16GB 512SSD" = 16 GB memory and 512 GB SSD. Only unambiguous patterns are used.
 */
export function specsOf(title: string, kind: string): { storage?: string; memory?: string } {
  const gb = (n: string, unit: string) => `${n} ${unit.toUpperCase()}`;
  if (kind === 'Laptop' || kind === 'Desktop') {
    const ssd = title.match(/\b(\d+)\s*(TB|GB)?\s*SSD\b/i);
    const ram = title.match(/\b(\d+)\s*GB\b(?!\s*SSD)/i);
    return { ...(ssd ? { storage: `${gb(ssd[1], ssd[2] ?? 'GB')} SSD` } : {}), ...(ram ? { memory: gb(ram[1], 'GB') } : {}) };
  }
  if (kind === 'Smartphone' || kind === 'Tablet' || kind === 'Smartwatch') {
    const m = title.match(/\b(\d+)\s*(GB|TB)\b/i);
    return m ? { storage: gb(m[1], m[2]) } : {};
  }
  return {};
}

const BATTERY_KINDS = new Set(['Smartphone', 'Tablet', 'Laptop', 'Smartwatch']);
const DEVICE_KINDS = new Set(['Smartphone', 'Tablet', 'Laptop', 'Desktop', 'Monitor', 'Smartwatch']);

/**
 * Product highlights: facts that are always true for this kind of refurbished device (Olivier, 2026-11).
 * Google does not allow price, shipping, returns or other promotional text here, so the return and
 * trade-in promises are not repeated (returns come from the Merchant Center return policy).
 */
export function highlightsOf(kind: string, brand: string | undefined, stars: string | null): string[] {
  if (!DEVICE_KINDS.has(kind)) return [];
  const out: string[] = [];
  if (stars === '4' || stars === '5') out.push('Premium originele kwaliteit');
  if (BATTERY_KINDS.has(kind)) out.push('Batterij minimaal 85% of kies een nieuwe batterij');
  if (brand === 'Apple') out.push('2 jaar garantie');
  out.push('Gecontroleerd op 50 punten', 'Met kwaliteitsgarantie');
  return out;
}

/**
 * Model key: the title without the condition part, so all quality grades of one model share one GTIN.
 * "iPhone 13 128GB Midnight Refurbished 5* M" -> "iphone 13 128gb midnight".
 */
const DUTCH_COLOURS: Record<string, string> = {
  rood: 'red', groen: 'green', roze: 'pink', blauw: 'blue', goud: 'gold', zilver: 'silver', zwart: 'black', wit: 'white',
  paars: 'purple', geel: 'yellow', sterrenlicht: 'starlight', middernacht: 'midnight', midhight: 'midnight', spacegrijs: 'space grey', grafiet: 'graphite',
};

export function modelKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*[-(]?\s*nieuw\b.*$/, '')
    .replace(/\s+(refurbished|refurb|refur|ref)\b.*$/, '')
    .replace(/\s+[1-5]\s*\*.*$/, '')
    .replace(/\bnaturel\b/g, 'natural')
    .replace(/\btitan\.(?=\s|\/|$)/g, 'titanium')
    .replace(/\bspacegrey\b/g, 'space grey')
    // One model, one key: Dutch colour names and common typos map to the English Apple/Samsung name,
    // and a bare capacity ("128", "256 gb") gets its unit, so "Rood" and "Red" share their GTIN.
    .replace(/\b(rood|groen|roze|blauw|goud|zilver|zwart|wit|paars|geel|sterrenlicht|middernacht|midhight|spacegrijs|grafiet)\b/g, w => DUTCH_COLOURS[w] ?? w)
    .replace(/\b(32|64|128|256|512)\s*gb?\b/g, '$1gb')
    .replace(/\b(32|64|128|256|512)(?=\s)(?!\s*(gb|tb)\b)/g, '$1gb')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Stored GTIN rows keyed by the current model key. Rows saved under an older spelling ("rood") stay
 * reachable; when two rows meet on one key, the row already stored under that exact key wins.
 */
export function gtinsByModel<T extends { model_key: string }>(rows: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of rows) {
    const key = modelKey(r.model_key);
    if (!out.has(key) || r.model_key === key) out.set(key, r);
  }
  return out;
}

const variantLink = (url: string, variantId: string, many: boolean) => many ? `${url}${url.includes('?') ? '&' : '?'}variant=${variantId}` : url;

export function offerHash(input: ProductInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

/**
 * Offers for one Shopify product, or the reason it is not sent. Test offers carry the test prefix and
 * are excluded from every destination, so they can be checked in Merchant Center without being shown.
 */
export function productOffers(p: FeedProduct, opts: { test: boolean; storeCodes?: StoreCodes; gtins?: Map<string, string> }): { offers: FeedOffer[]; skip?: Skip } {
  const skip = (reason: string) => ({ offers: [], skip: { productId: p.id, title: p.title, reason } });
  if (p.status !== 'ACTIVE') return skip('niet actief');
  if (p.refurbished?.value !== 'true') return skip('niet refurbished');
  if (!p.onlineStoreUrl) return skip('niet zichtbaar in de webshop');
  const images = p.media.nodes.map(n => n?.image?.url).filter((u): u is string => !!u);
  if (!images.length) return skip('geen foto');
  const description = plainText(p.descriptionHtml) || p.title;
  const brand = brandOf(p.manufacturer?.value, p.vendor);
  const stars = starsOf(p.title);
  const kind = kindOf(p.title, p.category?.fullName);
  const category = googleCategory(kind);
  const highlights = highlightsOf(kind, brand, stars);
  const variants = p.variants.nodes.filter(v => isPositive(v.price));
  if (!variants.length) return skip('geen prijs');
  const many = p.variants.nodes.length > 1;

  const offers = variants.map(v => {
    const selling = Number(v.price);
    // What the webshop can sell (locations that fulfil online orders), not the total over all locations.
    const qty = v.sellableOnlineQuantity ?? v.inventoryQuantity ?? 0;
    // The variant's own barcode first; otherwise the GTIN of the model (one per model, every grade), but
    // only for a variant without its own configuration: "256GB / Blue" is not the model in the title.
    const plainVariant = !v.title || v.title === 'Default Title';
    const gtin = v.barcodes.nodes.map(b => validGtin(b.value)).find(Boolean) ?? (plainVariant ? validGtin(opts.gtins?.get(modelKey(p.title))) : null) ?? null;
    // The variant's own title (e.g. "256GB / Blue") wins over the product title; per field.
    const variantTitle = v.title && v.title !== 'Default Title' ? v.title : '';
    const color = (variantTitle && colorOf(variantTitle)) || colorOf(p.title);
    const own = variantTitle ? specsOf(variantTitle, kind) : {};
    const base = specsOf(p.title, kind);
    const specs = { storage: own.storage ?? base.storage, memory: own.memory ?? base.memory };
    const details = [
      ...(specs.storage ? [{ sectionName: 'Specificaties', attributeName: 'Opslagcapaciteit', attributeValue: specs.storage }] : []),
      ...(specs.memory ? [{ sectionName: 'Specificaties', attributeName: 'Werkgeheugen', attributeValue: specs.memory }] : []),
      ...(stars ? [{ sectionName: 'Staat', attributeName: 'Kwaliteitsklasse', attributeValue: `${stars} sterren` }] : []),
    ];
    const title = (many && v.title && v.title !== 'Default Title' ? `${p.title} - ${v.title}` : p.title).slice(0, 150);
    const input: ProductInput = {
      offerId: `${opts.test ? TEST_PREFIX : ''}${v.legacyResourceId}`,
      contentLanguage: CONTENT_LANGUAGE,
      feedLabel: FEED_LABEL,
      productAttributes: {
        title,
        description,
        link: variantLink(p.onlineStoreUrl!, v.legacyResourceId, many),
        imageLink: images[0],
        ...(images.length > 1 ? { additionalImageLinks: images.slice(1, 11) } : {}),
        availability: qty > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        // Only the selling price: the Shopify compare-at price is often the new-device price, which was
        // never asked; Google (and Belgian law) only allow a struck-through price that was really charged.
        price: { amountMicros: micros(v.price), currencyCode: CURRENCY },
        condition: 'REFURBISHED',
        ...(brand ? { brand: brand.slice(0, 70) } : {}),
        ...(gtin ? { gtins: [gtin] } : { identifierExists: false }),
        ...(category ? { googleProductCategory: category } : {}),
        ...(p.category?.fullName && p.category.fullName !== 'Uncategorized' ? { productTypes: [p.category.fullName.slice(0, 750)] } : {}),
        ...(many ? { itemGroupId: p.legacyResourceId } : {}),
        // Product groups for Google Ads: category, quality, price range, brand, stock.
        customLabel0: kind,
        customLabel1: stars ? `${stars} sterren` : 'onbekend',
        customLabel2: priceBand(selling),
        customLabel3: (brand ?? 'onbekend').slice(0, 100),
        customLabel4: stockBand(qty),
        ...(color ? { color } : {}),
        ...(highlights.length >= 2 ? { productHighlights: highlights } : {}),
        ...(details.length ? { productDetails: details } : {}),
        ...(opts.test ? { excludedDestinations: TEST_EXCLUDED_DESTINATIONS } : {}),
      },
    };
    const local = localInventories(v, opts.storeCodes ?? {});
    return { productId: p.id, input, hash: offerHash(input), local, localHash: localHashOf(local) };
  });
  return { offers };
}

export type SentRow = { offer_id: string; hash: string; test: boolean; sent_at: string; local_hash?: string | null; local_stores?: string[] | null; local_sent_at?: string | null };
export type LocalUpdate = { offer: FeedOffer; removeStores: string[] };
/** Google lets offers expire 30 days after their last upload; unchanged offers are re-sent after this many days. */
export const REFRESH_AFTER_DAYS = 20;

/**
 * What to send: new or changed offers, unchanged offers that are getting old (refresh, oldest first), and
 * the offers sent earlier that are no longer wanted. Test and live offers are separate; a live run also
 * removes every leftover test offer, a test run never touches live offers.
 */
export function planFeed(offers: FeedOffer[], sent: SentRow[], opts: { test: boolean; now?: Date }) {
  const byId = new Map(sent.map(r => [r.offer_id, r]));
  const wanted = new Set(offers.map(o => o.input.offerId));
  const staleBefore = (opts.now ?? new Date()).getTime() - REFRESH_AFTER_DAYS * 86_400_000;
  const upserts = offers.filter(o => byId.get(o.input.offerId)?.hash !== o.hash);
  const refreshes = offers
    .filter(o => { const r = byId.get(o.input.offerId); return r && r.hash === o.hash && new Date(r.sent_at).getTime() < staleBefore; })
    .sort((a, b) => new Date(byId.get(a.input.offerId)!.sent_at).getTime() - new Date(byId.get(b.input.offerId)!.sent_at).getTime());
  const deletes = sent.filter(r => !wanted.has(r.offer_id) && (opts.test ? r.test : true)).map(r => r.offer_id);
  // Stock per store only for offers Google already has (sent in an earlier run): when it changed, when a
  // store lost its code (that store's stock is removed at Google), or when it gets old (it expires too).
  const local: LocalUpdate[] = [];
  for (const o of offers) {
    const r = byId.get(o.input.offerId);
    if (!r) continue;
    const now = new Set((o.local ?? []).map(l => l.storeCode));
    const removeStores = (r.local_stores ?? []).filter(code => !now.has(code));
    const ageing = !!o.localHash && (!r.local_sent_at || new Date(r.local_sent_at).getTime() < staleBefore);
    if ((o.localHash && r.local_hash !== o.localHash) || removeStores.length || ageing) local.push({ offer: o, removeStores });
  }
  return { upserts, refreshes, deletes, local, unchanged: offers.length - upserts.length - refreshes.length };
}

/** Shopify product IDs from what an admin types: numbers, GIDs or admin URLs, separated by spaces or commas. */
export function parseProductIds(text: string): string[] {
  const ids = [...text.matchAll(/(?:gid:\/\/shopify\/Product\/|\/products\/|\b)(\d{6,20})\b/g)].map(m => `gid://shopify/Product/${m[1]}`);
  return [...new Set(ids)];
}
