// Shopify product sync: pure mapping and change planning (no network, no database).
// The ERP exports a Shopify-style CSV (formerly imported by Matrixify). This module turns each
// CSV row into the desired Shopify state, compares it with the current Shopify state and plans
// the smallest set of batched mutations.

export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'UNLISTED';

/**
 * Sold-out refurbished devices stay reachable by their URL (a page with "niet meer op voorraad" and
 * alternatives, see the theme snippet uitverkocht) instead of becoming a 404: Shopify's UNLISTED status
 * keeps the page but leaves it out of collections, search, recommendations, the sitemap and Google.
 * Only when the ERP says DRAFT and there is no stock; everything else keeps the ERP status.
 */
export const isRefurbishedTitle = (title: string) => /\brefurbished\b/i.test(title);
export function targetStatus(erpStatus: ProductStatus | undefined, title: string, stock: number): ProductStatus | undefined {
  return erpStatus === 'DRAFT' && stock <= 0 && isRefurbishedTitle(title) ? 'UNLISTED' : erpStatus;
}
/** Existing drafts that become UNLISTED: at most this many per run, so the catch-up never trips the emergency brake. */
export const MAX_UNLIST_PER_RUN = 75;

/** Metafields copied from the CSV, with their Shopify type (as defined in the store). */
export const SYNCED_METAFIELDS = [
  { column: 'Metafield: custom.refurbished_product', namespace: 'custom', key: 'refurbished_product', type: 'boolean' },
  { column: 'Metafield: custom.vat_margin', namespace: 'custom', key: 'vat_margin', type: 'boolean' },
  { column: 'Metafield: magento.manufacturer', namespace: 'magento', key: 'manufacturer', type: 'single_line_text_field' },
  { column: 'Metafield: magento.tax_bebat [number_decimal]', namespace: 'magento', key: 'tax_bebat', type: 'number_decimal' },
  { column: 'Metafield: magento.tax_recupel [number_decimal]', namespace: 'magento', key: 'tax_recupel', type: 'number_decimal' },
] as const;
export type MetafieldSpec = (typeof SYNCED_METAFIELDS)[number];
export const metafieldId = (m: { namespace: string; key: string }) => `${m.namespace}.${m.key}`;

const INVENTORY_PREFIX = 'Inventory Available: ';

export type DesiredState = {
  sku: string;
  product: { title?: string; vendor?: string; productType?: string; status?: ProductStatus };
  variant: { priceCents?: number; compareAtCents?: number | null; taxable?: boolean };
  /** Available quantity per Shopify location name. */
  inventory: Record<string, number>;
  metafields: Record<string, string>;
  /** Fields only used when the product is created (new products start as draft). */
  create: { barcode?: string; tracked?: boolean; requiresShipping?: boolean; giftCard?: boolean };
};

/** Tag on products created by the sync. While it is present the ERP never changes the status. */
export const NEW_PRODUCT_TAG = 'erp-nieuw';
/** Extra tag on a new draft whose title already exists (in Shopify or on another ERP article). */
export const DUPLICATE_TITLE_TAG = 'controle-dubbele-titel';

/** Title key for duplicate detection: exact text, ignoring case and repeated spaces. */
export const titleKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLowerCase();

export type DuplicateTitleArticle = { sku: string; title: string; priceCents: number | null; status: string | null; inventory: Record<string, number>; productId?: string };

/** ERP articles whose title occurs more than once in the ERP file, grouped and sorted by title. */
export function duplicateTitles(desired: DesiredState[], current: CurrentState[]): DuplicateTitleArticle[] {
  const productBySku = new Map(current.map(c => [c.sku, c.productId]));
  const groups = new Map<string, DesiredState[]>();
  for (const d of desired) {
    if (!d.product.title) continue;
    const k = titleKey(d.product.title);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return [...groups.entries()].filter(([, g]) => g.length > 1).sort(([a], [b]) => a.localeCompare(b)).flatMap(([, g]) => g.map(d => ({
    sku: d.sku, title: d.product.title ?? '', priceCents: d.variant.priceCents ?? null, status: d.product.status ?? null,
    inventory: { ...d.inventory }, ...(productBySku.get(d.sku) ? { productId: productBySku.get(d.sku) } : {}),
  })));
}

export type CurrentState = {
  sku: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  title: string;
  vendor: string;
  productType: string;
  status: ProductStatus;
  priceCents: number;
  compareAtCents: number | null;
  taxable: boolean;
  /** Available quantity per location name (only locations where the item is stocked). */
  inventory: Record<string, number>;
  metafields: Record<string, string | null>;
  tags: string[];
};

export type Change = {
  sku: string;
  scope: 'product' | 'variant' | 'inventory' | 'metafield';
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type UnmatchedSku = { sku: string; title: string; productId?: string; inventory: Record<string, number>; status?: ProductStatus };
export type Plan = {
  changes: Change[];
  /** Products whose ERP variants disagree on product fields; left untouched (and never auto-published). */
  conflictedProducts: string[];
  /** SKUs that are not synced, so they can be listed and filtered in the admin page. */
  /** shopifyOnly excludes archived products; those are in shopifyOnlyArchived. */
  unmatched: { erpOnly: UnmatchedSku[]; shopifyOnly: UnmatchedSku[]; shopifyOnlyArchived: UnmatchedSku[]; duplicate: UnmatchedSku[] };
  /** Desired state of the ERP-only SKUs, for creating them as draft products. */
  newCandidates: DesiredState[];
  productUpdates: { id: string; title?: string; vendor?: string; productType?: string; status?: ProductStatus }[];
  variantUpdates: { productId: string; variants: { id: string; price?: string; compareAtPrice?: string | null; taxable?: boolean }[] }[];
  inventory: { inventoryItemId: string; locationId: string; quantity: number }[];
  metafields: { ownerId: string; namespace: string; key: string; type: string; value: string }[];
  counts: {
    erpRows: number;
    matched: number;
    unchanged: number;
    erpOnly: number;
    shopifyOnly: number;
    shopifyOnlyArchived: number;
    duplicateSkus: number;
    unknownLocations: string[];
    notStocked: number;
    productConflicts: number;
    invalidRows: number;
    /** Status changes skipped because the product still carries the erp-nieuw tag. */
    statusLocked: number;
    /** Drafts that should become UNLISTED but wait for a next run (MAX_UNLIST_PER_RUN). */
    unlistDeferred: number;
    /** Drafts made UNLISTED in this run (counts against MAX_UNLIST_PER_RUN). */
    unlistedFromDraft: number;
  };
};

// ---------- value parsing ----------

/** Parses "19.95", "19,95", 19.95 or "1.299,00" into cents; null when empty or invalid. */
export function parseMoneyCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  let value = String(raw).trim().replace(/\s|€/g, '');
  if (!value) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) value = value.replace(/\./g, '').replace(',', '.');
  else value = value.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

export const formatMoney = (cents: number) => (cents / 100).toFixed(2);

export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  const v = String(raw ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'ja', 'waar'].includes(v)) return true;
  if (['false', '0', 'no', 'nee', 'onwaar'].includes(v)) return false;
  return null;
}

export function parseQuantity(raw: unknown): number | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.max(-1_000_000, Math.min(1_000_000, Math.round(n)));
}

function parseStatus(raw: unknown): ProductStatus | undefined {
  const v = String(raw ?? '').trim().toUpperCase();
  return v === 'ACTIVE' || v === 'DRAFT' || v === 'ARCHIVED' ? v : undefined;
}

// Only trim: inner whitespace (e.g. double spaces in ERP titles) is kept exactly as Matrixify did,
// otherwise every such title would show up as a change.
const text = (raw: unknown, max: number) => {
  const v = String(raw ?? '').trim();
  return v ? v.slice(0, max) : undefined;
};

/** Normalises a metafield value to the form Shopify stores, so unchanged values compare equal. */
export function normalizeMetafield(type: string, raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (type === 'boolean') {
    const b = parseBool(raw);
    return b === null ? null : String(b);
  }
  if (type === 'number_decimal') {
    const cents = parseMoneyCents(raw);
    if (cents === null) return null;
    // Shopify keeps the decimal as given; compare numerically by using a canonical form.
    return String(Number((cents / 100).toFixed(2)));
  }
  return String(raw).trim().slice(0, 255);
}

/** Turns one ERP CSV row (as stored in erp_articles.raw_erp_row) into the desired Shopify state. */
export function desiredFromRow(row: Record<string, unknown>): DesiredState | null {
  const sku = String(row['Variant SKU [ID]'] ?? '').trim();
  if (!sku) return null;
  const desired: DesiredState = { sku, product: {}, variant: {}, inventory: {}, metafields: {}, create: {} };
  const barcode = text(row['Variant Barcode'], 255);
  if (barcode) desired.create.barcode = barcode;
  const tracker = String(row['Variant Inventory Tracker'] ?? '').trim().toLowerCase();
  if (tracker) desired.create.tracked = tracker === 'shopify';
  const shipping = parseBool(row['Variant Requires Shipping']);
  if (shipping !== null) desired.create.requiresShipping = shipping;
  const giftCard = parseBool(row['Gift Card']);
  if (giftCard !== null) desired.create.giftCard = giftCard;

  const title = text(row['Title'], 255);
  if (title) desired.product.title = title;
  const vendor = text(row['Vendor'], 255);
  if (vendor) desired.product.vendor = vendor;
  const type = text(row['Type'], 255);
  if (type) desired.product.productType = type;
  const status = parseStatus(row['Status']);
  if (status) desired.product.status = status;

  const price = parseMoneyCents(row['Variant Price']);
  if (price !== null && price >= 0) desired.variant.priceCents = price;
  if ('Variant Compare At Price' in row) {
    const compare = parseMoneyCents(row['Variant Compare At Price']);
    desired.variant.compareAtCents = compare !== null && compare > 0 ? compare : null;
  }
  const taxable = parseBool(row['Variant Taxable']);
  if (taxable !== null) desired.variant.taxable = taxable;

  for (const [column, value] of Object.entries(row)) {
    if (!column.startsWith(INVENTORY_PREFIX)) continue;
    const location = column.slice(INVENTORY_PREFIX.length).trim();
    const qty = parseQuantity(value);
    if (location && qty !== null) desired.inventory[location] = qty;
  }

  for (const spec of SYNCED_METAFIELDS) {
    if (!(spec.column in row)) continue;
    const value = normalizeMetafield(spec.type, row[spec.column]);
    if (value !== null) desired.metafields[metafieldId(spec)] = value;
  }
  return desired;
}

const sameCompare = (a: number | null | undefined, b: number | null | undefined) => (a ?? 0) === (b ?? 0);

/**
 * Compares the desired ERP state with the current Shopify state and plans batched mutations.
 * Only SKUs present on both sides are updated; nothing is deleted. Creating new products is planned
 * separately by planCreates.
 */
export function planSync(input: {
  desired: DesiredState[];
  current: CurrentState[];
  locations: Record<string, string>; // Shopify location name -> location id
  invalidRows?: number;
  maxUnlist?: number;
}): Plan {
  const plan: Plan = {
    changes: [], conflictedProducts: [], unmatched: { erpOnly: [], shopifyOnly: [], shopifyOnlyArchived: [], duplicate: [] }, newCandidates: [], productUpdates: [], variantUpdates: [], inventory: [], metafields: [],
    counts: { erpRows: input.desired.length + (input.invalidRows ?? 0), matched: 0, unchanged: 0, erpOnly: 0, shopifyOnly: 0, shopifyOnlyArchived: 0, duplicateSkus: 0, unknownLocations: [], notStocked: 0, productConflicts: 0, invalidRows: input.invalidRows ?? 0, statusLocked: 0, unlistDeferred: 0, unlistedFromDraft: 0 },
  };

  // Shopify SKUs that occur on more than one variant are ambiguous and never touched.
  const bySku = new Map<string, CurrentState>();
  const duplicate = new Set<string>();
  for (const c of input.current) {
    if (!c.sku) continue;
    if (bySku.has(c.sku)) duplicate.add(c.sku);
    else bySku.set(c.sku, c);
  }
  for (const sku of duplicate) {
    const c = bySku.get(sku)!;
    plan.unmatched.duplicate.push({ sku, title: c.title, productId: c.productId, inventory: { ...c.inventory } });
    bySku.delete(sku);
  }
  plan.counts.duplicateSkus = duplicate.size;

  const desiredSkus = new Set(input.desired.map(d => d.sku));
  for (const [sku, c] of bySku) {
    if (desiredSkus.has(sku)) continue;
    const entry = { sku, title: c.title, productId: c.productId, inventory: { ...c.inventory }, status: c.status };
    (c.status === 'ARCHIVED' ? plan.unmatched.shopifyOnlyArchived : plan.unmatched.shopifyOnly).push(entry);
  }
  plan.counts.shopifyOnly = plan.unmatched.shopifyOnly.length;
  plan.counts.shopifyOnlyArchived = plan.unmatched.shopifyOnlyArchived.length;

  const unknownLocations = new Set<string>();
  const productFields = new Map<string, { sku: string; update: Plan['productUpdates'][number]; desired: DesiredState['product'] }>();
  const conflicted = new Set<string>();
  const variantsByProduct = new Map<string, Plan['variantUpdates'][number]['variants']>();
  const add = (c: Change) => plan.changes.push(c);
  const maxUnlist = input.maxUnlist ?? MAX_UNLIST_PER_RUN;
  let unlisted = 0;
  // Stock per product after this run, for the sold-out rule: every Shopify variant of the product (also
  // one that is not in the ERP), per location the ERP quantity, or Shopify's own when the ERP does not
  // give one (a missing or blank column is never read as 0).
  const desiredBySku = new Map<string, DesiredState>();
  for (const d of input.desired) if (!duplicate.has(d.sku) && !desiredBySku.has(d.sku)) desiredBySku.set(d.sku, d);
  // Shopify's current stock counts too: UNLISTED only once Shopify itself is at 0, so a failed or skipped
  // stock write never leaves a reachable page that can still be bought. Until then the ERP draft applies;
  // the next run (stock written) makes it UNLISTED.
  const productStock = new Map<string, number>();
  for (const c of input.current) {
    const erp = c.sku && !duplicate.has(c.sku) ? desiredBySku.get(c.sku)?.inventory ?? {} : {};
    let stock = 0;
    for (const location of new Set([...Object.keys(c.inventory), ...Object.keys(erp)])) stock += Math.max(0, erp[location] ?? c.inventory[location] ?? 0) + Math.max(0, c.inventory[location] ?? 0);
    productStock.set(c.productId, (productStock.get(c.productId) ?? 0) + stock);
  }

  for (const d of input.desired) {
    if (duplicate.has(d.sku)) continue;
    const c = bySku.get(d.sku);
    if (!c) { plan.counts.erpOnly++; plan.unmatched.erpOnly.push({ sku: d.sku, title: d.product.title ?? '', inventory: { ...d.inventory } }); plan.newCandidates.push(d); continue; }
    plan.counts.matched++;
    const before = plan.changes.length;

    // Product fields: one product can carry several variants; they must agree.
    const seen = productFields.get(c.productId);
    if (seen) {
      const a = seen.desired, b = d.product;
      if (a.title !== b.title || a.vendor !== b.vendor || a.productType !== b.productType || a.status !== b.status) conflicted.add(c.productId);
    } else {
      const update: Plan['productUpdates'][number] = { id: c.productId };
      if (d.product.title !== undefined && d.product.title !== c.title) { update.title = d.product.title; add({ sku: d.sku, scope: 'product', field: 'title', oldValue: c.title, newValue: d.product.title }); }
      if (d.product.vendor !== undefined && d.product.vendor !== c.vendor) { update.vendor = d.product.vendor; add({ sku: d.sku, scope: 'product', field: 'vendor', oldValue: c.vendor, newValue: d.product.vendor }); }
      if (d.product.productType !== undefined && d.product.productType !== c.productType) { update.productType = d.product.productType; add({ sku: d.sku, scope: 'product', field: 'productType', oldValue: c.productType, newValue: d.product.productType }); }
      const wanted = targetStatus(d.product.status, d.product.title ?? c.title, productStock.get(c.productId) ?? 0);
      if (wanted !== undefined && wanted !== c.status) {
        // A product created as draft by the sync keeps its status until someone removes the erp-nieuw tag.
        if (c.tags.includes(NEW_PRODUCT_TAG)) plan.counts.statusLocked++;
        // Old drafts move to UNLISTED a batch at a time; a product selling out now (ACTIVE) goes right away.
        else if (c.status === 'DRAFT' && wanted === 'UNLISTED' && unlisted >= maxUnlist) plan.counts.unlistDeferred++;
        else {
          if (c.status === 'DRAFT' && wanted === 'UNLISTED') { unlisted++; plan.counts.unlistedFromDraft++; }
          update.status = wanted; add({ sku: d.sku, scope: 'product', field: 'status', oldValue: c.status, newValue: wanted });
        }
      }
      productFields.set(c.productId, { sku: d.sku, update, desired: d.product });
    }

    // Variant fields.
    const v: Plan['variantUpdates'][number]['variants'][number] = { id: c.variantId };
    let variantChanged = false;
    if (d.variant.priceCents !== undefined && d.variant.priceCents !== c.priceCents) {
      v.price = formatMoney(d.variant.priceCents); variantChanged = true;
      add({ sku: d.sku, scope: 'variant', field: 'price', oldValue: formatMoney(c.priceCents), newValue: v.price });
    }
    if (d.variant.compareAtCents !== undefined && !sameCompare(d.variant.compareAtCents, c.compareAtCents)) {
      v.compareAtPrice = d.variant.compareAtCents ? formatMoney(d.variant.compareAtCents) : null; variantChanged = true;
      add({ sku: d.sku, scope: 'variant', field: 'compareAtPrice', oldValue: c.compareAtCents ? formatMoney(c.compareAtCents) : null, newValue: v.compareAtPrice });
    }
    if (d.variant.taxable !== undefined && d.variant.taxable !== c.taxable) {
      v.taxable = d.variant.taxable; variantChanged = true;
      add({ sku: d.sku, scope: 'variant', field: 'taxable', oldValue: String(c.taxable), newValue: String(d.variant.taxable) });
    }
    if (variantChanged) {
      const list = variantsByProduct.get(c.productId) ?? [];
      list.push(v);
      variantsByProduct.set(c.productId, list);
    }

    // Inventory per location.
    for (const [location, qty] of Object.entries(d.inventory)) {
      const locationId = input.locations[location];
      if (!locationId) { unknownLocations.add(location); continue; }
      if (!(location in c.inventory)) { plan.counts.notStocked++; continue; }
      if (c.inventory[location] === qty) continue;
      plan.inventory.push({ inventoryItemId: c.inventoryItemId, locationId, quantity: qty });
      add({ sku: d.sku, scope: 'inventory', field: location, oldValue: String(c.inventory[location]), newValue: String(qty) });
    }

    // Metafields (product level).
    for (const spec of SYNCED_METAFIELDS) {
      const id = metafieldId(spec);
      const want = d.metafields[id];
      if (want === undefined) continue;
      const have = c.metafields[id] ?? null;
      const haveNorm = have === null ? null : normalizeMetafield(spec.type, have);
      if (haveNorm === want) continue;
      if (seen) continue; // product-level: only from the first variant of the product
      plan.metafields.push({ ownerId: c.productId, namespace: spec.namespace, key: spec.key, type: spec.type, value: want });
      add({ sku: d.sku, scope: 'metafield', field: id, oldValue: have, newValue: want });
    }

    if (plan.changes.length === before) plan.counts.unchanged++;
  }

  // Products whose variants disagree on product fields are left untouched (and reported).
  plan.counts.productConflicts = conflicted.size;
  plan.conflictedProducts = [...conflicted];
  for (const [productId, { update, sku }] of productFields) {
    if (conflicted.has(productId)) {
      plan.changes = plan.changes.filter(c => !(c.scope === 'product' && c.sku === sku));
      continue;
    }
    if (Object.keys(update).length > 1) plan.productUpdates.push(update);
  }
  for (const [productId, variants] of variantsByProduct) plan.variantUpdates.push({ productId, variants });
  plan.counts.unknownLocations = [...unknownLocations].sort();
  return plan;
}

export type ProductSetInput = {
  files?: { originalSource: string; contentType: 'IMAGE'; alt: string; duplicateResolutionMode: 'APPEND_UUID' }[];
  title: string; vendor?: string; productType?: string; status: 'DRAFT'; tags: string[]; descriptionHtml?: string;
  productOptions: { name: string; values: { name: string }[] }[];
  metafields: { namespace: string; key: string; type: string; value: string }[];
  variants: {
    optionValues: { optionName: string; name: string }[];
    sku: string; price: string; compareAtPrice?: string | null; taxable?: boolean;
    barcodes?: { value: string }[];
    inventoryItem: { tracked: boolean; requiresShipping?: boolean };
    inventoryQuantities: { locationId: string; name: 'available'; quantity: number }[];
  }[];
};

/**
 * Plans new draft products for ERP-only SKUs (one product with one variant per CSV row, as the
 * ERP file has no handle/option columns). Rows without title or price, gift cards and rows the ERP
 * marks as archived are skipped. Only known locations are stocked; negative stock becomes 0.
 */
export const CATEGORY_REVIEW_TAG = 'controle-categorie';
export const NO_CATEGORY_TAG = 'geen-categorie';
export const NO_IMAGE_TAG = 'geen-afbeelding';
export const NO_DESCRIPTION_TAG = 'geen-beschrijving';

const titleTokens = (t: string) => t.toLowerCase().replace(/[^a-z0-9.+-]+/g, ' ').trim().split(' ').filter(Boolean);
const skuFamily = (sku: string) => sku.trim().padStart(12, '0').slice(0, 3);
const isCategoryTag = (tag: string) => (tag.startsWith('cat_') && tag.length > 4) || (tag.startsWith('attribute_set_code_') && tag.length > 19);

/**
 * Category tags for a new product, copied from the most similar existing Shopify product: same SKU
 * family (first 3 digits, e.g. 207 = MacBook) and the longest common start of the title (the model
 * is at the start), then the largest word overlap. Requires at least two leading words in common.
 */
/** Existing products of the same SKU family, most similar title first (at least 2 leading words in common). */
export function rankSimilar<T extends { sku: string; title: string }>(sku: string, title: string, existing: T[]): (T & { lead: number; score: number })[] {
  const family = skuFamily(sku);
  const words = titleTokens(title);
  const ranked: (T & { lead: number; score: number })[] = [];
  for (const e of existing) {
    if (e.sku === sku || skuFamily(e.sku) !== family) continue;
    const other = titleTokens(e.title);
    let lead = 0;
    while (lead < words.length && lead < other.length && words[lead] === other[lead]) lead++;
    if (lead < 2) continue;
    const a = new Set(words), b = new Set(other);
    const overlap = [...a].filter(w => b.has(w)).length / new Set([...a, ...b]).size;
    ranked.push({ ...e, lead, score: lead * 10 + overlap });
  }
  return ranked.sort((x, y) => y.score - x.score);
}

/**
 * Category tags for a new product, copied from the most similar existing Shopify product (see
 * rankSimilar) that has at least one category tag.
 */
export function suggestCategoryTags(sku: string, title: string, existing: { sku: string; title: string; tags: string[] }[]): { tags: string[]; fromSku: string } | null {
  for (const e of rankSimilar(sku, title, existing)) {
    const tags = e.tags.filter(isCategoryTag);
    if (tags.some(t => t.startsWith('cat_'))) return { tags: [...new Set(tags)].sort(), fromSku: e.sku };
  }
  return null;
}

export function planCreates(candidates: DesiredState[], locations: Record<string, string>, context: { shopifyTitles?: string[]; erpTitles?: string[]; existing?: { sku: string; title: string; tags: string[] }[] } = {}): { creates: { sku: string; input: ProductSetInput; categoryFrom: string | null }[]; skipped: { sku: string; reason: string }[] } {
  const creates: { sku: string; input: ProductSetInput; categoryFrom: string | null }[] = [];
  const skipped: { sku: string; reason: string }[] = [];
  // A title that already exists in Shopify, or on more than one ERP article, may be an accidental
  // duplicate in the ERP: the draft is still created, but tagged for review.
  const shopifyTitles = new Set((context.shopifyTitles ?? []).map(titleKey));
  const erpTitleCount = new Map<string, number>();
  for (const t of context.erpTitles ?? []) erpTitleCount.set(titleKey(t), (erpTitleCount.get(titleKey(t)) ?? 0) + 1);
  for (const d of candidates) {
    if (!d.product.title) { skipped.push({ sku: d.sku, reason: 'geen titel' }); continue; }
    if (d.variant.priceCents === undefined) { skipped.push({ sku: d.sku, reason: 'geen prijs' }); continue; }
    if (d.create.giftCard) { skipped.push({ sku: d.sku, reason: 'cadeaubon' }); continue; }
    if (d.product.status === 'ARCHIVED') { skipped.push({ sku: d.sku, reason: 'gearchiveerd in ERP' }); continue; }
    const inventoryQuantities = Object.entries(d.inventory)
      .filter(([name]) => locations[name])
      .map(([name, quantity]) => ({ locationId: locations[name], name: 'available' as const, quantity: Math.max(0, quantity) }));
    const metafields = SYNCED_METAFIELDS.flatMap(m => {
      const value = d.metafields[metafieldId(m)];
      return value === undefined ? [] : [{ namespace: m.namespace, key: m.key, type: m.type, value }];
    });
    const category = suggestCategoryTags(d.sku, d.product.title, context.existing ?? []);
    const duplicateTitle = shopifyTitles.has(titleKey(d.product.title)) || (erpTitleCount.get(titleKey(d.product.title)) ?? 0) > 1;
    const tags = [NEW_PRODUCT_TAG, ...(duplicateTitle ? [DUPLICATE_TITLE_TAG] : []),
      ...(category ? [CATEGORY_REVIEW_TAG, ...category.tags] : [NO_CATEGORY_TAG]), `main_sku_${d.sku.replace(/^0+/, '')}`];
    creates.push({
      sku: d.sku,
      categoryFrom: category?.fromSku ?? null,
      input: {
        title: d.product.title,
        ...(d.product.vendor ? { vendor: d.product.vendor } : {}),
        ...(d.product.productType ? { productType: d.product.productType } : {}),
        status: 'DRAFT',
        tags,
        productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
        metafields,
        variants: [{
          optionValues: [{ optionName: 'Title', name: 'Default Title' }],
          sku: d.sku,
          price: formatMoney(d.variant.priceCents),
          ...(d.variant.compareAtCents ? { compareAtPrice: formatMoney(d.variant.compareAtCents) } : {}),
          ...(d.variant.taxable !== undefined ? { taxable: d.variant.taxable } : {}),
          ...(d.create.barcode ? { barcodes: [{ value: d.create.barcode }] } : {}),
          inventoryItem: { tracked: d.create.tracked ?? true, ...(d.create.requiresShipping !== undefined ? { requiresShipping: d.create.requiresShipping } : {}) },
          inventoryQuantities,
        }],
      },
    });
  }
  return { creates, skipped };
}

/** Tag to keep a Shopify-only product as it is (no stock 0, no archive). */
export const KEEP_TAG = 'erp-negeren';

/**
 * Always on, also when the cleanup setting is off: an ACTIVE product of which no SKU is in the ERP any
 * more may not stay for sale. Once all its variants have been missing for afterHours it goes to draft
 * (a refurbished device to UNLISTED)
 * and its positive stock to 0 (a draft that still holds stock gets the stock reset only). Archiving and
 * deleting stay manual. erp-negeren is respected.
 */
export function planDeactivateMissing(input: {
  missing: CurrentState[]; all: CurrentState[]; erpSkus: Set<string>; firstMissing: Map<string, Date>; now: Date;
  locations: Record<string, string>; afterHours: number; maxUnlist?: number;
}): { inventory: Plan['inventory']; deactivate: { productId: string; title: string; skus: string[]; status: 'DRAFT' | 'UNLISTED' }[]; changes: Change[]; unlistDeferred: number } {
  const inventory: Plan['inventory'] = [];
  const changes: Change[] = [];
  const deactivate: { productId: string; title: string; skus: string[]; status: 'DRAFT' | 'UNLISTED' }[] = [];
  const maxUnlist = input.maxUnlist ?? MAX_UNLIST_PER_RUN;
  let unlisted = 0;
  let unlistDeferred = 0;
  const byProduct = new Map<string, CurrentState[]>();
  for (const v of input.all) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const seen = new Set<string>();
  for (const v of input.missing) {
    if (seen.has(v.productId)) continue;
    seen.add(v.productId);
    if (v.status === 'ARCHIVED' || v.tags.includes(KEEP_TAG)) continue;
    const variants = byProduct.get(v.productId) ?? [v];
    const allGone = variants.every(x => !input.erpSkus.has(x.sku)
      && (input.now.getTime() - (input.firstMissing.get(x.sku)?.getTime() ?? input.now.getTime())) >= input.afterHours * 3_600_000);
    if (!allGone) continue;
    // A draft that still holds stock (an earlier stock write failed, or it was already a draft) only gets
    // the stock reset, so a partial failure always recovers in a later run.
    // A refurbished device stays reachable (UNLISTED, see targetStatus), but only once Shopify's stock is
    // already 0: while stock remains (this run writes the 0) it goes to draft first, and becomes UNLISTED in
    // a next run, a batch at a time like the other old drafts. Anything else goes to draft.
    const shopifyStock = variants.reduce((sum, x) => sum + Object.values(x.inventory).reduce((a, q) => a + Math.max(0, q), 0), 0);
    const unlist = isRefurbishedTitle(v.title) && shopifyStock === 0;
    if (v.status === 'ACTIVE' || (v.status === 'DRAFT' && unlist && !v.tags.includes(NEW_PRODUCT_TAG))) {
      const status = unlist ? 'UNLISTED' as const : 'DRAFT' as const;
      if (v.status === 'DRAFT' && unlisted >= maxUnlist) unlistDeferred++;
      else {
        if (v.status === 'DRAFT') unlisted++;
        deactivate.push({ productId: v.productId, title: v.title, skus: variants.map(x => x.sku), status });
        changes.push({ sku: v.sku, scope: 'product', field: 'status', oldValue: v.status, newValue: status });
      }
    }
    for (const x of variants) {
      for (const [location, quantity] of Object.entries(x.inventory)) {
        const locationId = input.locations[location];
        if (!locationId || quantity <= 0) continue;
        inventory.push({ inventoryItemId: x.inventoryItemId, locationId, quantity: 0 });
        changes.push({ sku: x.sku, scope: 'inventory', field: location, oldValue: String(quantity), newValue: '0' });
      }
    }
  }
  return { inventory, deactivate, changes, unlistDeferred };
}

/**
 * Articles that are no longer in the ERP but still in Shopify (active or draft): stock to 0 at every
 * location right away, and archive the product once all its variants have been missing for
 * archiveAfterHours and no longer have stock. Products with the tag erp-negeren are left alone.
 */
export function planMissing(input: {
  missing: CurrentState[]; all: CurrentState[]; erpSkus: Set<string>; firstMissing: Map<string, Date>; now: Date;
  locations: Record<string, string>; archiveAfterHours: number;
}): { inventory: Plan['inventory']; archive: { productId: string; title: string; skus: string[] }[]; changes: Change[]; kept: number } {
  const inventory: Plan['inventory'] = [];
  const changes: Change[] = [];
  const archive: { productId: string; title: string; skus: string[] }[] = [];
  let kept = 0;
  const byProduct = new Map<string, CurrentState[]>();
  for (const v of input.all) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  const seenProducts = new Set<string>();
  for (const v of input.missing) {
    if (v.status === 'ARCHIVED') continue;
    if (v.tags.includes(KEEP_TAG)) { kept++; continue; }
    for (const [location, quantity] of Object.entries(v.inventory)) {
      const locationId = input.locations[location];
      if (!locationId || quantity <= 0) continue;
      inventory.push({ inventoryItemId: v.inventoryItemId, locationId, quantity: 0 });
      changes.push({ sku: v.sku, scope: 'inventory', field: location, oldValue: String(quantity), newValue: '0' });
    }
    if (seenProducts.has(v.productId)) continue;
    seenProducts.add(v.productId);
    const variants = byProduct.get(v.productId) ?? [v];
    // Archive only once the stock is already 0 everywhere (set by an earlier run), so a product is
    // never archived while it still has stock, even if a stock write fails in this run.
    const allGoneLongEnough = variants.every(x => !input.erpSkus.has(x.sku) && Object.values(x.inventory).every(q => q <= 0)
      && (input.now.getTime() - (input.firstMissing.get(x.sku)?.getTime() ?? input.now.getTime())) >= input.archiveAfterHours * 3_600_000);
    if (allGoneLongEnough) {
      archive.push({ productId: v.productId, title: v.title, skus: variants.map(x => x.sku) });
      changes.push({ sku: v.sku, scope: 'product', field: 'status', oldValue: v.status, newValue: 'ARCHIVED' });
    }
  }
  return { inventory, archive, changes, kept };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Total number of field changes a plan would write; used for the safety brake. */
export const planSize = (plan: Plan) => plan.changes.length;
