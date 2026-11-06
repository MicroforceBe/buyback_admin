import 'server-only';
// Minimal Shopify Admin GraphQL client for the Dev Dashboard app "Microforce ERP Sync".
// Authenticates with the client credentials grant (token valid 24 h, refreshed automatically).
// Configuration comes only from server-side environment variables; nothing is ever logged.

export const SHOPIFY_API_VERSION = '2026-10';

export type ShopifyConfig = { domain: string; clientId: string; clientSecret: string };

export class ShopifyError extends Error {
  constructor(message: string) { super(message); this.name = 'ShopifyError'; }
}

/** Reads and validates the configuration. The domain must be the store's myshopify.com domain. */
export function shopifyConfig(env: Record<string, string | undefined> = process.env): ShopifyConfig | null {
  const domain = (env.SHOPIFY_STORE_DOMAIN ?? '').trim().toLowerCase();
  const clientId = (env.SHOPIFY_CLIENT_ID ?? '').trim();
  const clientSecret = (env.SHOPIFY_CLIENT_SECRET ?? '').trim();
  if (!domain && !clientId && !clientSecret) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(domain)) throw new ShopifyError('SHOPIFY_STORE_DOMAIN moet het myshopify.com-domein van de winkel zijn.');
  if (!clientId || !clientSecret) throw new ShopifyError('SHOPIFY_CLIENT_ID en SHOPIFY_CLIENT_SECRET zijn verplicht.');
  return { domain, clientId, clientSecret };
}

type Fetch = typeof fetch;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function createShopifyClient(config: ShopifyConfig, deps: { fetch?: Fetch; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}) {
  const doFetch = deps.fetch ?? fetch;
  const wait = deps.sleep ?? sleep;
  const now = deps.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt - 60_000 > now()) return token.value;
    const response = await doFetch(`https://${config.domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'microforce-buyback-admin' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }),
    });
    if (!response.ok) throw new ShopifyError(`Aanmelden bij Shopify mislukt (HTTP ${response.status}). Controleer de app en of ze op de winkel geïnstalleerd is.`);
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new ShopifyError('Shopify gaf geen toegangstoken terug.');
    token = { value: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  /**
   * Runs a GraphQL operation; retries on throttling and transient server errors. Pass
   * retryServerErrors: false for non-idempotent writes (creating a product): a 5xx may still have
   * been processed, and a retry could create a duplicate.
   */
  async function graphql<T>(query: string, variables: Record<string, unknown> = {}, options: { retryServerErrors?: boolean } = {}): Promise<T> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      const response = await doFetch(`https://${config.domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await accessToken(), 'User-Agent': 'microforce-buyback-admin' },
        body: JSON.stringify({ query, variables }),
      });
      if ((response.status === 429 || (response.status >= 500 && options.retryServerErrors !== false)) && attempt < 6) { await wait(Math.min(1000 * 2 ** attempt, 20_000)); continue; }
      if (response.status === 401 && !refreshed) { refreshed = true; token = null; continue; }
      if (!response.ok) throw new ShopifyError(`Shopify antwoordde met HTTP ${response.status}.`);
      const body = (await response.json()) as { data?: T; errors?: { message?: string; extensions?: { code?: string } }[]; extensions?: { cost?: { throttleStatus?: { currentlyAvailable?: number; restoreRate?: number }; requestedQueryCost?: number } } };
      const throttled = body.errors?.some(e => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < 8) {
        const status = body.extensions?.cost?.throttleStatus;
        const needed = (body.extensions?.cost?.requestedQueryCost ?? 100) - (status?.currentlyAvailable ?? 0);
        await wait(Math.max(1000, Math.ceil((needed / (status?.restoreRate || 50)) * 1000)));
        continue;
      }
      if (body.errors?.length) throw new ShopifyError('Shopify GraphQL-fout: ' + body.errors.map(e => e.message).filter(Boolean).join('; ').slice(0, 500));
      if (!body.data) throw new ShopifyError('Shopify gaf geen gegevens terug.');
      return body.data;
    }
  }

  /** Starts a bulk query, waits until it finishes and returns the JSONL text ('' when empty). */
  async function bulkQuery(query: string, options: { timeoutMs?: number; pollMs?: number } = {}): Promise<string> {
    const started = await graphql<{ bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation RunBulk($query: String!) { bulkOperationRunQuery(query: $query, groupObjects: false) { bulkOperation { id } userErrors { field message } } }`,
      { query },
    );
    const op = started.bulkOperationRunQuery;
    if (!op.bulkOperation || op.userErrors.length) throw new ShopifyError('Bulk-export kon niet starten: ' + op.userErrors.map(e => e.message).join('; ').slice(0, 300));
    const deadline = now() + (options.timeoutMs ?? 180_000);
    for (;;) {
      await wait(options.pollMs ?? 2000);
      const { bulkOperation } = await graphql<{ bulkOperation: { status: string; errorCode: string | null; url: string | null } | null }>(
        `query BulkStatus($id: ID!) { bulkOperation(id: $id) { status errorCode url } }`,
        { id: op.bulkOperation.id },
      );
      if (!bulkOperation) throw new ShopifyError('Bulk-export niet gevonden.');
      if (bulkOperation.status === 'COMPLETED') {
        if (!bulkOperation.url) return '';
        const url = new URL(bulkOperation.url);
        if (url.protocol !== 'https:') throw new ShopifyError('Onveilige downloadlink voor de bulk-export.');
        const file = await doFetch(url.toString());
        if (!file.ok) throw new ShopifyError(`Bulk-export downloaden mislukt (HTTP ${file.status}).`);
        return await file.text();
      }
      if (['FAILED', 'CANCELED', 'CANCELLED', 'EXPIRED'].includes(bulkOperation.status)) throw new ShopifyError(`Bulk-export mislukt (${bulkOperation.status}${bulkOperation.errorCode ? ', ' + bulkOperation.errorCode : ''}).`);
      if (now() > deadline) throw new ShopifyError('Bulk-export duurde te lang; de volgende run probeert opnieuw.');
    }
  }

  async function locations(): Promise<Record<string, string>> {
    const data = await graphql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(`query Locations { locations(first: 50) { nodes { id name isActive } } }`);
    return Object.fromEntries(data.locations.nodes.filter(l => l.isActive).map(l => [l.name, l.id]));
  }

  return { graphql, bulkQuery, locations };
}

export type ShopifyClient = ReturnType<typeof createShopifyClient>;

// ---------- mutations (fields checked against the Admin API 2026-10 schema) ----------

export const PRODUCT_UPDATE = `mutation SyncProduct($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;

export const VARIANTS_UPDATE = `mutation SyncVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: true) { userErrors { field message } }
}`;

// The ERP is the source of truth for stock, as it was with Matrixify, so absolute quantities are
// set without compare-and-swap (changeFromQuantity: null). An idempotency key is required since 2026-04.
export const INVENTORY_SET = `mutation SyncInventory($input: InventorySetQuantitiesInput!, $key: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { code field message } }
}`;

export const METAFIELDS_SET = `mutation SyncMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { code field message } }
}`;

// Creates one new product (status DRAFT). No identifier: productSet then always creates.
export const PRODUCT_CREATE = `mutation CreateDraftProduct($input: ProductSetInput!) {
  productSet(input: $input, synchronous: true) { product { id } userErrors { code field message } }
}`;

// ---------- product clean-up (archive / restore / delete) ----------

export const PRODUCTS_INFO = `query ProductsInfo($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id title handle status totalInventory
      variants(first: 100) { nodes { sku } pageInfo { hasNextPage } }
      collections(first: 1) { nodes { handle } }
    }
  }
}`;

export const PRODUCT_SET_STATUS = `mutation SetProductStatus($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id status } userErrors { field message } }
}`;

export const PRODUCT_DELETE = `mutation DeleteProduct($id: ID!) {
  productDelete(input: { id: $id }) { deletedProductId userErrors { field message } }
}`;

export const URL_REDIRECT_CREATE = `mutation CreateRedirect($path: String!, $target: String!) {
  urlRedirectCreate(urlRedirect: { path: $path, target: $target }) { urlRedirect { id } userErrors { field message } }
}`;

export const APP_SCOPES = `query AppScopes { currentAppInstallation { accessScopes { handle } } }`;
