// Shopify product sync: pure mapping and change planning (no network, no database).
// The ERP exports a Shopify-style CSV (formerly imported by Matrixify). This module turns each
// CSV row into the desired Shopify state, compares it with the current Shopify state and plans
// the smallest set of batched mutations.

export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

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
};

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
};

export type Change = {
  sku: string;
  scope: 'product' | 'variant' | 'inventory' | 'metafield';
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type UnmatchedSku = { sku: string; title: string; productId?: string };
export type Plan = {
  changes: Change[];
  /** SKUs that are not synced, so they can be listed and filtered in the admin page. */
  unmatched: { erpOnly: UnmatchedSku[]; shopifyOnly: UnmatchedSku[]; duplicate: UnmatchedSku[] };
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
    duplicateSkus: number;
    unknownLocations: string[];
    notStocked: number;
    productConflicts: number;
    invalidRows: number;
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
  const desired: DesiredState = { sku, product: {}, variant: {}, inventory: {}, metafields: {} };

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
 * Only SKUs present on both sides are touched; nothing is created or deleted in Shopify.
 */
export function planSync(input: {
  desired: DesiredState[];
  current: CurrentState[];
  locations: Record<string, string>; // Shopify location name -> location id
  invalidRows?: number;
}): Plan {
  const plan: Plan = {
    changes: [], unmatched: { erpOnly: [], shopifyOnly: [], duplicate: [] }, productUpdates: [], variantUpdates: [], inventory: [], metafields: [],
    counts: { erpRows: input.desired.length + (input.invalidRows ?? 0), matched: 0, unchanged: 0, erpOnly: 0, shopifyOnly: 0, duplicateSkus: 0, unknownLocations: [], notStocked: 0, productConflicts: 0, invalidRows: input.invalidRows ?? 0 },
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
    plan.unmatched.duplicate.push({ sku, title: c.title, productId: c.productId });
    bySku.delete(sku);
  }
  plan.counts.duplicateSkus = duplicate.size;

  const desiredSkus = new Set(input.desired.map(d => d.sku));
  for (const [sku, c] of bySku) if (!desiredSkus.has(sku)) plan.unmatched.shopifyOnly.push({ sku, title: c.title, productId: c.productId });
  plan.counts.shopifyOnly = plan.unmatched.shopifyOnly.length;

  const unknownLocations = new Set<string>();
  const productFields = new Map<string, { sku: string; update: Plan['productUpdates'][number]; desired: DesiredState['product'] }>();
  const conflicted = new Set<string>();
  const variantsByProduct = new Map<string, Plan['variantUpdates'][number]['variants']>();
  const add = (c: Change) => plan.changes.push(c);

  for (const d of input.desired) {
    if (duplicate.has(d.sku)) continue;
    const c = bySku.get(d.sku);
    if (!c) { plan.counts.erpOnly++; plan.unmatched.erpOnly.push({ sku: d.sku, title: d.product.title ?? '' }); continue; }
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
      if (d.product.status !== undefined && d.product.status !== c.status) { update.status = d.product.status; add({ sku: d.sku, scope: 'product', field: 'status', oldValue: c.status, newValue: d.product.status }); }
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

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Total number of field changes a plan would write; used for the safety brake. */
export const planSize = (plan: Plan) => plan.changes.length;
