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
  products(first: 15, after: $after, query: "status:active") {
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
  variants(first: 20) { pageInfo { hasNextPage endCursor } nodes { ...FeedVariant } }
}
${variantFragment()}`;
}

function variantFragment() {
  return `fragment FeedVariant on ProductVariant { id legacyResourceId title sku barcodes(first: 3) { nodes { value } } price compareAtPrice inventoryQuantity }`;
}

/** The variants after the first page, for the rare product with more than 20. */
export const FEED_MORE_VARIANTS = `query FeedMoreVariants($id: ID!, $after: String) {
  product(id: $id) { variants(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { ...FeedVariant } } }
}
${variantFragment()}`;

export type FeedVariant = { id: string; legacyResourceId: string; title: string; sku: string | null; barcodes: { nodes: { value: string }[] }; price: string; compareAtPrice: string | null; inventoryQuantity: number | null };
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
    availability: 'IN_STOCK' | 'OUT_OF_STOCK'; price: Price; salePrice?: Price; condition: 'REFURBISHED';
    brand?: string; gtins?: string[]; identifierExists?: boolean; googleProductCategory?: string; productTypes?: string[]; itemGroupId?: string;
    customLabel0: string; customLabel1: string; customLabel2: string; customLabel3: string; customLabel4: string;
    excludedDestinations?: string[];
  };
};
export type FeedOffer = { productId: string; input: ProductInput; hash: string };
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

const variantLink = (url: string, variantId: string, many: boolean) => many ? `${url}${url.includes('?') ? '&' : '?'}variant=${variantId}` : url;

export function offerHash(input: ProductInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 32);
}

/**
 * Offers for one Shopify product, or the reason it is not sent. Test offers carry the test prefix and
 * are excluded from every destination, so they can be checked in Merchant Center without being shown.
 */
export function productOffers(p: FeedProduct, opts: { test: boolean }): { offers: FeedOffer[]; skip?: Skip } {
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
  const variants = p.variants.nodes.filter(v => isPositive(v.price));
  if (!variants.length) return skip('geen prijs');
  const many = p.variants.nodes.length > 1;

  const offers = variants.map(v => {
    const selling = Number(v.price);
    const onSale = isPositive(v.compareAtPrice) && Number(v.compareAtPrice) > selling;
    const qty = v.inventoryQuantity ?? 0;
    const gtin = v.barcodes.nodes.map(b => validGtin(b.value)).find(Boolean) ?? null;
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
        price: { amountMicros: micros(onSale ? v.compareAtPrice! : v.price), currencyCode: CURRENCY },
        ...(onSale ? { salePrice: { amountMicros: micros(v.price), currencyCode: CURRENCY } } : {}),
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
        ...(opts.test ? { excludedDestinations: TEST_EXCLUDED_DESTINATIONS } : {}),
      },
    };
    return { productId: p.id, input, hash: offerHash(input) };
  });
  return { offers };
}

export type SentRow = { offer_id: string; hash: string; test: boolean; sent_at: string };
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
  return { upserts, refreshes, deletes, unchanged: offers.length - upserts.length - refreshes.length };
}

/** Shopify product IDs from what an admin types: numbers, GIDs or admin URLs, separated by spaces or commas. */
export function parseProductIds(text: string): string[] {
  const ids = [...text.matchAll(/(?:gid:\/\/shopify\/Product\/|\/products\/|\b)(\d{6,20})\b/g)].map(m => `gid://shopify/Product/${m[1]}`);
  return [...new Set(ids)];
}
