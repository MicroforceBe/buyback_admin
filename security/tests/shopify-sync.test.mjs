import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function loadModules(db = null) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout });
  const modules = new Map();
  const internal = { '@/lib/shopify/enrich': 'lib/shopify/enrich.ts', '@/lib/shopify/plan': 'lib/shopify/plan.ts', '@/lib/shopify/state': 'lib/shopify/state.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/sync': 'lib/shopify/sync.ts' };
  let n = 0;
  async function load(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return load(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { randomUUID: () => 'key-' + ++n }, '@/lib/supabaseAdmin': { supabaseAdmin: db } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  const ns = async p => (await load(p)).namespace;
  return { plan: await ns('lib/shopify/plan.ts'), state: await ns('lib/shopify/state.ts'), client: await ns('lib/shopify/client.ts'), sync: db ? await ns('lib/shopify/sync.ts') : null };
}

const csvRow = (over = {}) => ({
  'Variant SKU [ID]': 'SKU1', Title: 'iPhone 13 128GB', Vendor: 'Apple', Type: 'Smartphone', Status: 'Active',
  'Variant Price': '499,00', 'Variant Compare At Price': '', 'Variant Taxable': 'TRUE',
  'Inventory Available: Microforce Gentbrugge': '2', 'Inventory Available: Microforce Antwerpen': '0',
  'Metafield: custom.refurbished_product': 'TRUE', 'Metafield: magento.tax_bebat [number_decimal]': '0.00', ...over,
});
const current = (over = {}) => ({
  sku: 'SKU1', productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11', inventoryItemId: 'gid://shopify/InventoryItem/111',
  title: 'iPhone 13 128GB', vendor: 'Apple', productType: 'Smartphone', status: 'ACTIVE', priceCents: 49900, compareAtCents: null, taxable: true,
  inventory: { 'Microforce Gentbrugge': 2, 'Microforce Antwerpen': 0 }, metafields: { 'custom.refurbished_product': 'true', 'magento.tax_bebat': '0' }, tags: [], ...over,
});
const LOCS = { 'Microforce Gentbrugge': 'gid://shopify/Location/1', 'Microforce Antwerpen': 'gid://shopify/Location/2' };

test('money, booleans and decimals are parsed the way the ERP writes them', async () => {
  const { plan } = await loadModules();
  assert.equal(plan.parseMoneyCents('19,95'), 1995);
  assert.equal(plan.parseMoneyCents('1.299,00'), 129900);
  assert.equal(plan.parseMoneyCents('1299.5'), 129950);
  assert.equal(plan.parseMoneyCents(''), null);
  assert.equal(plan.parseBool('TRUE'), true);
  assert.equal(plan.parseBool('false'), false);
  assert.equal(plan.normalizeMetafield('number_decimal', '0.00'), '0');
  assert.equal(plan.normalizeMetafield('number_decimal', '3,5'), plan.normalizeMetafield('number_decimal', '3.50'));
});

test('an identical ERP row and Shopify variant plan no changes', async () => {
  const { plan } = await loadModules();
  const p = plan.planSync({ desired: [plan.desiredFromRow(csvRow())], current: [current()], locations: LOCS });
  assert.equal(p.changes.length, 0);
  assert.equal(p.counts.unchanged, 1);
});

test('titles keep inner double spaces from the ERP, so they match Shopify', async () => {
  const { plan } = await loadModules();
  const t = 'Office Home & Business 2024  PC/MAC';
  const p = plan.planSync({ desired: [plan.desiredFromRow(csvRow({ Title: ' ' + t + ' ' }))], current: [current({ title: t })], locations: LOCS });
  assert.equal(p.changes.length, 0);
});

test('price, stock, status and metafield differences become batched mutations', async () => {
  const { plan } = await loadModules();
  const desired = plan.desiredFromRow(csvRow({ 'Variant Price': '449,00', 'Variant Compare At Price': '499,00', Status: 'Draft', 'Inventory Available: Microforce Antwerpen': '3', 'Metafield: custom.refurbished_product': 'FALSE' }));
  const p = plain(plan.planSync({ desired: [desired], current: [current()], locations: LOCS }));
  assert.deepEqual(p.productUpdates, [{ id: 'gid://shopify/Product/1', status: 'DRAFT' }]);
  assert.deepEqual(p.variantUpdates, [{ productId: 'gid://shopify/Product/1', variants: [{ id: 'gid://shopify/ProductVariant/11', price: '449.00', compareAtPrice: '499.00' }] }]);
  assert.deepEqual(p.inventory, [{ inventoryItemId: 'gid://shopify/InventoryItem/111', locationId: 'gid://shopify/Location/2', quantity: 3 }]);
  assert.equal(p.metafields.length, 1);
  assert.equal(p.metafields[0].value, 'false');
});

test('nothing is created or deleted: one-sided and duplicate SKUs are only counted', async () => {
  const { plan } = await loadModules();
  const p = plan.planSync({
    desired: [plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'ONLY-ERP' })), plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'DUP', 'Variant Price': '1,00' }))],
    current: [current({ sku: 'ONLY-SHOP' }), current({ sku: 'DUP' }), current({ sku: 'DUP', variantId: 'gid://shopify/ProductVariant/12' })],
    locations: LOCS,
  });
  assert.equal(p.changes.length, 0);
  assert.equal(p.counts.erpOnly, 1);
  assert.equal(p.counts.shopifyOnly, 1);
  assert.equal(p.counts.duplicateSkus, 1);
  assert.deepEqual(plain(p.unmatched.erpOnly.map(u => [u.sku, u.inventory])), [['ONLY-ERP', { 'Microforce Gentbrugge': 2, 'Microforce Antwerpen': 0 }]]);
  assert.deepEqual(plain(p.unmatched.shopifyOnly), [{ sku: 'ONLY-SHOP', title: 'iPhone 13 128GB', productId: 'gid://shopify/Product/1', inventory: { 'Microforce Gentbrugge': 2, 'Microforce Antwerpen': 0 }, status: 'ACTIVE' }]);
  assert.deepEqual(plain(p.unmatched.duplicate.map(u => u.sku)), ['DUP']);
});

test('archived Shopify-only products are counted separately', async () => {
  const { plan } = await loadModules();
  const p = plan.planSync({ desired: [], current: [current({ sku: 'A' }), current({ sku: 'B', status: 'ARCHIVED', variantId: 'gid://shopify/ProductVariant/12' })], locations: LOCS });
  assert.equal(p.counts.shopifyOnly, 1);
  assert.equal(p.counts.shopifyOnlyArchived, 1);
  assert.deepEqual(plain(p.unmatched.shopifyOnlyArchived.map(u => u.sku)), ['B']);
});

test('stock is only set where the item is stocked; unknown locations are reported', async () => {
  const { plan } = await loadModules();
  const p = plan.planSync({
    desired: [plan.desiredFromRow(csvRow({ 'Inventory Available: Microforce Oudenaarde': '4', 'Inventory Available: Microforce Antwerpen': '5' }))],
    current: [current({ inventory: { 'Microforce Gentbrugge': 2 } })],
    locations: LOCS,
  });
  assert.equal(p.inventory.length, 0);
  assert.equal(p.counts.notStocked, 1);
  assert.deepEqual(plain(p.counts.unknownLocations), ['Microforce Oudenaarde']);
});

test('the bulk export is parsed with inventory levels attached to their variant', async () => {
  const { state } = await loadModules();
  const jsonl = [
    JSON.stringify({ id: 'gid://shopify/ProductVariant/11', sku: 'SKU1', price: '499.00', compareAtPrice: null, taxable: true, inventoryItem: { id: 'gid://shopify/InventoryItem/111' }, product: { id: 'gid://shopify/Product/1', title: 'T', vendor: 'Apple', productType: 'X', status: 'ACTIVE', mf_custom_refurbished_product: { value: 'true' }, mf_magento_tax_bebat: null } }),
    JSON.stringify({ __parentId: 'gid://shopify/ProductVariant/11', location: { id: 'gid://shopify/Location/1', name: 'Microforce Gentbrugge' }, quantities: [{ name: 'available', quantity: 7 }] }),
  ].join('\n');
  const parsed = plain(state.parseBulkVariants(jsonl));
  assert.equal(parsed.variants.length, 1);
  assert.equal(parsed.variants[0].priceCents, 49900);
  assert.deepEqual(parsed.variants[0].inventory, { 'Microforce Gentbrugge': 7 });
  assert.equal(parsed.variants[0].metafields['custom.refurbished_product'], 'true');
  assert.deepEqual(parsed.locations, { 'Microforce Gentbrugge': 'gid://shopify/Location/1' });
});

test('configuration only accepts a myshopify.com domain and both credentials', async () => {
  const { client } = await loadModules();
  assert.equal(client.shopifyConfig({}), null);
  assert.throws(() => client.shopifyConfig({ SHOPIFY_STORE_DOMAIN: 'evil.example.com', SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' }), /myshopify/);
  assert.throws(() => client.shopifyConfig({ SHOPIFY_STORE_DOMAIN: 'shop.myshopify.com', SHOPIFY_CLIENT_ID: 'a' }), /verplicht/);
  assert.deepEqual(plain(client.shopifyConfig({ SHOPIFY_STORE_DOMAIN: ' Shop.myshopify.com ', SHOPIFY_CLIENT_ID: 'a', SHOPIFY_CLIENT_SECRET: 'b' })), { domain: 'shop.myshopify.com', clientId: 'a', clientSecret: 'b' });
});

test('client reuses its token, retries server errors and refreshes on 401', async () => {
  const { client } = await loadModules();
  const calls = [];
  const replies = [{ status: 500 }, { status: 401 }, { status: 200, body: { data: { ok: 1 } } }];
  let tokens = 0;
  const fetch = async (url, init) => {
    calls.push([String(url), init?.headers?.['X-Shopify-Access-Token']]);
    if (String(url).endsWith('/oauth/access_token')) { tokens++; return { ok: true, status: 200, json: async () => ({ access_token: 'tok' + tokens, expires_in: 86399 }) }; }
    const r = replies.shift();
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  const c = client.createShopifyClient({ domain: 'shop.myshopify.com', clientId: 'a', clientSecret: 'b' }, { fetch, sleep: async () => {}, now: () => 0 });
  assert.deepEqual(plain(await c.graphql('{ ok }')), { ok: 1 });
  assert.equal(tokens, 2);
  assert.ok(calls.every(([url]) => url.startsWith('https://shop.myshopify.com/admin/')));
  assert.ok(calls.some(([url]) => url.includes('/api/2026-10/graphql.json')));
});

test('bulk export refuses a non-https download link', async () => {
  const { client } = await loadModules();
  const replies = [{ bulkOperationRunQuery: { bulkOperation: { id: 'b1' }, userErrors: [] } }, { bulkOperation: { status: 'COMPLETED', errorCode: null, url: 'http://insecure.example/x' } }];
  const fetch = async url => String(url).endsWith('/oauth/access_token')
    ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 86399 }) }
    : { ok: true, status: 200, json: async () => ({ data: replies.shift() }) };
  const c = client.createShopifyClient({ domain: 'shop.myshopify.com', clientId: 'a', clientSecret: 'b' }, { fetch, sleep: async () => {}, now: () => 0 });
  await assert.rejects(c.bulkQuery('{ x }'), /Onveilige/);
});

// ---------- sync run ----------
function fakeDb({ mode = 'shadow', maxChanges = 1500, rows = [csvRow()], running = false, modeAfter = null, createDrafts = false } = {}) {
  const log = [];
  let settingsReads = 0;
  function from(table) {
    const q = { table, ops: [] };
    const result = () => {
      const write = q.ops.find(o => ['insert', 'update', 'delete'].includes(o[0]));
      if (write) log.push({ table, op: write[0], row: write[1], filters: q.ops.filter(o => ['eq', 'lt', 'not', 'neq'].includes(o[0])) });
      if (table === 'shopify_sync_settings') { settingsReads++; return { data: { mode: settingsReads > 1 && modeAfter ? modeAfter : mode, max_changes: maxChanges, create_drafts: createDrafts }, error: null }; }
      if (table === 'erp_articles') return { data: rows.map(r => ({ sku: r['Variant SKU [ID]'], raw_erp_row: r })), error: null };
      if (table === 'shopify_sync_runs' && write?.[0] === 'insert') return running ? { data: null, error: { code: '23505' } } : { data: { id: 'run-1' }, error: null };
      return { data: null, error: null };
    };
    const builder = new Proxy({}, { get(_, k) {
      if (k === 'then') return (yes, no) => Promise.resolve(result()).then(yes, no);
      if (k === 'single' || k === 'maybeSingle') return async () => result();
      return (...args) => { q.ops.push([k, ...args]); return builder; };
    } });
    return builder;
  }
  return { db: { from }, log };
}
function fakeClient(variants, { failInventory = false, failVariantIndex = null, refMetafields = {} } = {}) {
  const mutations = [];
  return {
    mutations,
    client: {
      bulkQuery: async () => variants.map(v => JSON.stringify({ id: v.variantId, sku: v.sku, price: (v.priceCents / 100).toFixed(2), compareAtPrice: null, taxable: v.taxable, inventoryItem: { id: v.inventoryItemId }, product: { id: v.productId, title: v.title, vendor: v.vendor, productType: v.productType, status: v.status, tags: v.tags, mf_custom_refurbished_product: { value: 'true' }, mf_magento_tax_bebat: { value: '0' } } })
        + '\n' + Object.entries(v.inventory).map(([name, q]) => JSON.stringify({ __parentId: v.variantId, location: { id: LOCS[name], name }, quantities: [{ name: 'available', quantity: q }] })).join('\n')).join('\n'),
      locations: async () => LOCS,
      graphql: async (query, vars, options) => {
        if (/^query /.test(query.trim())) { if (query.includes('nodes(ids')) return { nodes: (vars.ids ?? []).map(id => ({ id, metafields: { nodes: refMetafields[id] ?? [] } })) }; }
        mutations.push([query.match(/mutation (\w+)/)?.[1], plain(vars), options && plain(options)]);
        let userErrors = failInventory && query.includes('inventorySetQuantities') ? [{ message: 'Niet toegestaan' }] : [];
        if (failVariantIndex !== null && query.includes('productVariantsBulkUpdate')) userErrors = [{ field: ['variants', String(failVariantIndex), 'price'], message: 'Ongeldige prijs' }];
        const field = query.match(/\{\s*(\w+)\(/)[1];
        if (field === 'productSet') return { productSet: { product: { id: 'gid://shopify/Product/999' }, userErrors } };
        if (field === 'nodes') return { nodes: (vars.ids ?? []).map(id => ({ id, metafields: { nodes: [] } })) };
        return { [field]: { userErrors } };
      },
    },
  };
}

test('mode off does nothing at all', async () => {
  const { db, log } = fakeDb({ mode: 'off' });
  const { sync } = await loadModules(db);
  const result = await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fakeClient([current()]).client });
  assert.deepEqual(plain(result), { status: 'skipped', reason: 'off' });
  assert.equal(log.length, 0);
});

test('missing configuration skips without creating a run', async () => {
  const { db, log } = fakeDb();
  const { sync } = await loadModules(db);
  assert.deepEqual(plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: null })), { status: 'skipped', reason: 'not_configured' });
  assert.ok(!log.some(l => l.op === 'insert'));
});

test('a second concurrent run is refused by the database', async () => {
  const { db } = fakeDb({ running: true });
  const { sync } = await loadModules(db);
  assert.deepEqual(plain(await sync.runShopifySync({ trigger: 'manual', actor: 'x' }, { client: fakeClient([current()]).client })), { status: 'skipped', reason: 'running' });
});

test('shadow mode records the changes but never writes to Shopify', async () => {
  const { db, log } = fakeDb({ rows: [csvRow({ 'Variant Price': '399,00' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current()]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.mode, 'shadow');
  assert.equal(fake.mutations.length, 0);
  const recorded = log.find(l => l.table === 'shopify_sync_changes' && l.op === 'insert');
  assert.deepEqual(plain(result.counts.shopifyOnlySkus), []);
  assert.deepEqual(plain(result.counts.erpOnlySkus), []);
  assert.deepEqual(plain(recorded.row).map(r => [r.sku, r.field, r.old_value, r.new_value]), [['SKU1', 'price', '499.00', '399.00']]);
});

test('live mode stops at the safety brake without writing anything', async () => {
  const { db, log } = fakeDb({ mode: 'live', maxChanges: 1, rows: [csvRow({ 'Variant Price': '399,00', Status: 'Draft' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current()]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(result.status, 'stopped');
  assert.match(result.error, /Noodrem/);
  assert.equal(fake.mutations.length, 0);
  assert.ok(log.some(l => l.table === 'shopify_sync_runs' && l.op === 'update' && l.row.status === 'stopped'));
});

test('live mode writes the changes and records per-SKU errors', async () => {
  const { db, log } = fakeDb({ mode: 'live', rows: [csvRow({ 'Variant Price': '399,00', 'Inventory Available: Microforce Antwerpen': '1' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current()], { failInventory: true });
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client, idempotencyKey: () => 'k1' }));
  assert.deepEqual(fake.mutations.map(m => m[0]), ['SyncVariants', 'SyncInventory']);
  const inv = fake.mutations[1][1];
  assert.equal(inv.key, 'k1');
  assert.equal(inv.input.quantities[0].changeFromQuantity, null);
  assert.equal(result.status, 'failed');
  assert.equal(result.counts.failedSkus, 1);
  const errorUpdates = log.filter(l => l.table === 'shopify_sync_changes' && l.op === 'update' && l.row.error);
  assert.equal(errorUpdates.length, 1);
  assert.equal(errorUpdates[0].row.error, 'Niet toegestaan');
  // Only the inventory change of SKU1 is marked failed; its successful price change stays applied.
  assert.deepEqual(plain(errorUpdates[0].filters.filter(f => f[0] === 'eq').map(f => [f[1], f[2]])), [['run_id', 'run-1'], ['sku', 'SKU1'], ['scope', 'inventory'], ['field', 'Microforce Antwerpen']]);
});

test('variant updates are sent in batches of at most 250', async () => {
  const many = Array.from({ length: 251 }, (_, i) => current({ sku: 'V' + i, variantId: 'gid://shopify/ProductVariant/' + (1000 + i), inventoryItemId: 'gid://shopify/InventoryItem/' + (5000 + i) }));
  const { db } = fakeDb({ mode: 'live', rows: many.map(v => csvRow({ 'Variant SKU [ID]': v.sku, 'Variant Price': '1,00' })) });
  const { sync } = await loadModules(db);
  const fake = fakeClient(many);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(result.status, 'succeeded');
  const sizes = fake.mutations.filter(m => m[0] === 'SyncVariants').map(m => m[1].variants.length);
  assert.deepEqual(sizes, [250, 1]);
});

test('a rejected variant only marks that SKU as failed', async () => {
  const two = [current(), current({ sku: 'SKU2', variantId: 'gid://shopify/ProductVariant/12', inventoryItemId: 'gid://shopify/InventoryItem/112' })];
  const { db, log } = fakeDb({ mode: 'live', rows: two.map(v => csvRow({ 'Variant SKU [ID]': v.sku, 'Variant Price': '1,00' })) });
  const { sync } = await loadModules(db);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fakeClient(two, { failVariantIndex: 1 }).client }));
  assert.equal(result.counts.failedSkus, 1);
  const errs = log.filter(l => l.table === 'shopify_sync_changes' && l.op === 'update' && l.row.error);
  assert.deepEqual(plain(errs.map(e => [e.filters.find(f => f[1] === 'sku')[2], e.row.error])), [['SKU2', 'Ongeldige prijs']]);
});

test('a rejected metafield batch marks every metafield change in it as failed (atomic mutation)', async () => {
  const two = [current(), current({ sku: 'SKU2', productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/12', inventoryItemId: 'gid://shopify/InventoryItem/112' })];
  const { db, log } = fakeDb({ mode: 'live', rows: two.map(v => csvRow({ 'Variant SKU [ID]': v.sku, 'Metafield: custom.refurbished_product': 'FALSE' })) });
  const { sync } = await loadModules(db);
  const fake = fakeClient(two);
  const original = fake.client.graphql;
  fake.client.graphql = async (q, v) => q.includes('metafieldsSet') ? { metafieldsSet: { userErrors: [{ field: ['metafields', '1', 'value'], message: 'Ongeldig' }] } } : original(q, v);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(result.counts.failedSkus, 2);
  const errs = log.filter(l => l.table === 'shopify_sync_changes' && l.op === 'update' && l.row.error);
  assert.deepEqual(plain(errs.map(e => e.filters.find(f => f[1] === 'sku')[2]).sort()), ['SKU1', 'SKU2']);
  assert.ok(errs.every(e => e.filters.some(f => f[1] === 'field' && f[2] === 'custom.refurbished_product')));
});

test('the emergency stop halts a live run before the next write', async () => {
  const { db, log } = fakeDb({ mode: 'live', modeAfter: 'off', rows: [csvRow({ 'Variant Price': '399,00', Status: 'Draft' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current()]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(result.status, 'stopped');
  assert.match(result.error, /Noodstop/);
  assert.equal(fake.mutations.length, 0);
  assert.ok(!log.some(l => l.table === 'shopify_sync_changes' && l.op === 'update' && l.row.applied === true));
});

test('new ERP articles are planned as single-variant draft products tagged erp-nieuw', async () => {
  const { plan } = await loadModules();
  const ok = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'NEW1', Status: 'Active', 'Variant Compare At Price': '599,00', 'Variant Barcode': '1234567890123', 'Variant Inventory Tracker': 'shopify', 'Variant Requires Shipping': 'TRUE', 'Gift Card': 'FALSE', 'Inventory Available: Microforce Antwerpen': '-2', 'Inventory Available: Onbekend': '5' }));
  const archived = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'OLD', Status: 'Archived' }));
  const noPrice = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'NOPRICE', 'Variant Price': '' }));
  const gift = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'GIFT', 'Gift Card': 'TRUE' }));
  const r = plain(plan.planCreates([ok, archived, noPrice, gift], LOCS));
  assert.deepEqual(r.skipped, [{ sku: 'OLD', reason: 'gearchiveerd in ERP' }, { sku: 'NOPRICE', reason: 'geen prijs' }, { sku: 'GIFT', reason: 'cadeaubon' }]);
  assert.equal(r.creates.length, 1);
  const input = r.creates[0].input;
  assert.equal(input.status, 'DRAFT');
  assert.deepEqual(input.tags, ['erp-nieuw', 'geen-categorie', 'main_sku_NEW1']);
  assert.equal(input.title, 'iPhone 13 128GB');
  assert.deepEqual(input.variants[0].optionValues, [{ optionName: 'Title', name: 'Default Title' }]);
  assert.equal(input.variants[0].sku, 'NEW1');
  assert.equal(input.variants[0].price, '499.00');
  assert.equal(input.variants[0].compareAtPrice, '599.00');
  assert.deepEqual(input.variants[0].barcodes, [{ value: '1234567890123' }]);
  assert.deepEqual(input.variants[0].inventoryItem, { tracked: true, requiresShipping: true });
  assert.deepEqual(input.variants[0].inventoryQuantities, [
    { locationId: 'gid://shopify/Location/1', name: 'available', quantity: 2 },
    { locationId: 'gid://shopify/Location/2', name: 'available', quantity: 0 },
  ]);
  assert.deepEqual(input.metafields.map(m => [m.namespace + '.' + m.key, m.value]), [['custom.refurbished_product', 'true'], ['magento.tax_bebat', '0']]);
});

test('the ERP never changes the status of a product still tagged erp-nieuw', async () => {
  const { plan } = await loadModules();
  const p = plan.planSync({ desired: [plan.desiredFromRow(csvRow({ Status: 'Active' }))], current: [current({ status: 'DRAFT', tags: ['erp-nieuw'] })], locations: LOCS });
  assert.equal(p.changes.length, 0);
  assert.equal(p.counts.statusLocked, 1);
  const untagged = plan.planSync({ desired: [plan.desiredFromRow(csvRow({ Status: 'Active' }))], current: [current({ status: 'DRAFT' })], locations: LOCS });
  assert.deepEqual(plain(untagged.productUpdates), [{ id: 'gid://shopify/Product/1', status: 'ACTIVE' }]);
});

test('draft creation is off unless enabled', async () => {
  const { db } = fakeDb({ mode: 'live', rows: [csvRow(), csvRow({ 'Variant SKU [ID]': 'NEW1' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current()]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(fake.mutations.length, 0);
  assert.equal(result.counts.newDrafts, undefined);
});

test('shadow mode only records planned drafts; live mode creates them without server-error retries', async () => {
  for (const mode of ['shadow', 'live']) {
    const { db, log } = fakeDb({ mode, createDrafts: true, rows: [csvRow(), csvRow({ 'Variant SKU [ID]': 'NEW1' })] });
    const { sync } = await loadModules(db);
    const fake = fakeClient([current()]);
    const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
    assert.equal(result.status, 'succeeded');
    assert.equal(result.counts.newDrafts, 1);
    const recorded = plain(log.find(l => l.table === 'shopify_sync_changes' && l.op === 'insert').row);
    assert.deepEqual(recorded.map(r => [r.sku, r.scope, r.field, r.new_value]), [['NEW1', 'product', 'nieuw artikel (draft)', 'iPhone 13 128GB — geen categorie gevonden — 0 eigenschappen ingevuld']]);
    if (mode === 'shadow') assert.equal(fake.mutations.length, 0);
    else {
      assert.deepEqual(fake.mutations.map(m => m[0]), ['CreateDraftProduct']);
      assert.deepEqual(fake.mutations[0][2], { retryServerErrors: false });
      assert.equal(fake.mutations[0][1].input.status, 'DRAFT');
    }
  }
});

test('a suspicious number of new articles creates nothing', async () => {
  const rows = Array.from({ length: 201 }, (_, i) => csvRow({ 'Variant SKU [ID]': 'X' + i }));
  const { db } = fakeDb({ mode: 'live', createDrafts: true, rows });
  const { sync } = await loadModules(db);
  const fake = fakeClient([]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.match(result.counts.createBlocked, /verdacht veel/);
  assert.equal(fake.mutations.length, 0);
});

test('at most 50 drafts are created per run', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => csvRow({ 'Variant SKU [ID]': 'N' + i }));
  const { db } = fakeDb({ mode: 'live', createDrafts: true, rows });
  const { sync } = await loadModules(db);
  const fake = fakeClient([]);
  const result = plain(await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client }));
  assert.equal(fake.mutations.length, 50);
  assert.equal(result.counts.newDraftsPending, 10);
});

test('client does not retry server errors when asked (non-idempotent create)', async () => {
  const { client } = await loadModules();
  let calls = 0;
  const fetch = async url => String(url).endsWith('/oauth/access_token')
    ? { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 86399 }) }
    : (calls++, { ok: false, status: 502, json: async () => ({}) });
  const c = client.createShopifyClient({ domain: 'shop.myshopify.com', clientId: 'a', clientSecret: 'b' }, { fetch, sleep: async () => {}, now: () => 0 });
  await assert.rejects(c.graphql('mutation X { x }', {}, { retryServerErrors: false }), /HTTP 502/);
  assert.equal(calls, 1);
});

test('duplicate ERP titles are listed per article, case and spacing ignored', async () => {
  const { plan } = await loadModules();
  const d = [
    plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'A', Title: 'iPhone 16  Black', 'Variant Price': '549,00' })),
    plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'B', Title: 'iphone 16 black', 'Variant Price': '529,00', Status: 'Draft' })),
    plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'C', Title: 'Uniek' })),
  ];
  const list = plain(plan.duplicateTitles(d, [current({ sku: 'A' })]));
  assert.deepEqual(list.map(x => [x.sku, x.priceCents, x.status, x.productId ?? null]), [['A', 54900, 'ACTIVE', 'gid://shopify/Product/1'], ['B', 52900, 'DRAFT', null]]);
});

test('a new draft whose title already exists is still created but tagged for review', async () => {
  const { plan } = await loadModules();
  const dup = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'NEW1', Title: 'iPhone 13 128GB' }));
  const other = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'NEW2', Title: 'Ander toestel' }));
  const twin = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': 'NEW3', Title: 'Tweeling' }));
  const r = plain(plan.planCreates([dup, other, twin], LOCS, { shopifyTitles: ['iPhone 13  128GB'], erpTitles: ['iPhone 13 128GB', 'Ander toestel', 'Tweeling', 'tweeling'] }));
  assert.deepEqual(r.creates.map(c => [c.sku, c.input.tags.includes('controle-dubbele-titel')]), [['NEW1', true], ['NEW2', false], ['NEW3', true]]);
});

test('quiet runs are pruned after 24 hours, other runs after 30 days', async () => {
  const { db, log } = fakeDb();
  const { sync } = await loadModules(db);
  await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fakeClient([current()]).client });
  const deletes = plain(log.filter(l => l.table === 'shopify_sync_runs' && l.op === 'delete'));
  assert.equal(deletes.length, 2);
  const quiet = deletes.find(d => d.filters.some(f => f[1] === 'counts->>changes'));
  assert.deepEqual(quiet.filters.filter(f => f[0] === 'eq').map(f => [f[1], f[2]]), [['status', 'succeeded'], ['counts->>changes', '0']]);
  const hours = (Date.now() - new Date(quiet.filters.find(f => f[0] === 'lt')[2]).getTime()) / 3_600_000;
  assert.ok(hours > 23.9 && hours < 24.1);
});

test('category tags are copied from the most similar product in the same SKU family', async () => {
  const { plan } = await loadModules();
  const existing = [
    { sku: '211000037140', title: 'iPhone 13 128GB Blue Refurbished 4*', tags: ['attribute_set_code_Refurbished iPhones', 'cat_iPhone', 'cat_iPhone 13', 'cat_microforce', 'main_sku_211000037140', 'erp-nieuw'] },
    { sku: '211000037999', title: 'iPhone 13 Mini 128GB Red Refurbished 4*', tags: ['attribute_set_code_Refurbished iPhones', 'cat_iPhone', 'cat_iPhone 13 Mini', 'cat_microforce'] },
    { sku: '207000037217', title: 'iPhone 13 Mini 128GB Red sleeve', tags: ['cat_Accessoires'] },
    { sku: '211000030000', title: 'iPhone 13 Mini kapot', tags: ['cat_'] },
  ];
  const s = plain(plan.suggestCategoryTags('211000040892', 'iPhone 13 Mini 128GB Red Refurbished 5*', existing));
  assert.deepEqual(s, { tags: ['attribute_set_code_Refurbished iPhones', 'cat_iPhone', 'cat_iPhone 13 Mini', 'cat_microforce'], fromSku: '211000037999' });
  assert.equal(plan.suggestCategoryTags('211000040000', 'Samsung A55 5G', existing), null);
  assert.equal(plan.suggestCategoryTags('216000040000', 'iPhone 13 Mini 128GB', existing), null);
});

test('a new draft gets the copied category tags, a review tag and its own main_sku tag', async () => {
  const { plan } = await loadModules();
  const d = plan.desiredFromRow(csvRow({ 'Variant SKU [ID]': '211000040892', Title: 'iPhone 13 Mini 128GB Red Refurbished 5*' }));
  const r = plain(plan.planCreates([d], LOCS, { existing: [{ sku: '211000037999', title: 'iPhone 13 Mini 128GB Red Refurbished 4*', tags: ['cat_iPhone', 'cat_iPhone 13 Mini', 'main_sku_211000037999'] }] }));
  assert.deepEqual(r.creates[0].input.tags, ['erp-nieuw', 'controle-categorie', 'cat_iPhone', 'cat_iPhone 13 Mini', 'main_sku_211000040892']);
  assert.equal(r.creates[0].categoryFrom, '211000037999');
});

test('cron route requires the cron secret and the job runs after the ERP import', () => {
  const route = read('app/api/shopify-sync/route.ts');
  assert.match(route, /bearerMatches\(request\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/);
  const crons = JSON.parse(read('vercel.json')).crons;
  assert.deepEqual(crons.find(c => c.path === '/api/shopify-sync'), { path: '/api/shopify-sync', schedule: '5-59/15 * * * *' });
});

test('admin page guards: mode and manual run are admin-only, the stop button needs ERP write', () => {
  const page = read('app/admin/erp/shopify/actions.ts');
  assert.match(page, /async function saveSettingsAction[\s\S]*?requireAccess\('erp', 'write', true\)/);
  assert.match(page, /async function runNowAction[\s\S]*?requireAccess\('erp', 'write', true\)/);
  assert.match(page, /async function stopAction[\s\S]*?requireAccess\('erp', 'write', false\)/);
  assert.match(page, /\.eq\('id', true\)\.eq\('version', current\.version\)\.select\('mode'\)/);
  assert.match(page, /if \(!stopped\) redirect\(back\(\{ error: 'Noodstop mislukt/);
  assert.match(read('app/admin/erp/shopify/page.tsx'), /requirePageAccess\('erp'\)/);
  assert.match(page, /\.eq\('version', version\)/);
});

test('the ERP import keeps the complete CSV row for the Shopify sync', () => {
  assert.match(read('lib/erpSync.ts'), /raw_erp_row: row,/);
});

// ---------- properties of new drafts ----------
async function loadEnrich() {
  const context = vm.createContext({ Set, Map, Object, Array, String, RegExp, Number, JSON });
  const code = ts.transpileModule(read('lib/shopify/enrich.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const m = new vm.SourceTextModule(code, { context });
  await m.link(() => { throw new Error('no imports'); });
  await m.evaluate();
  return m.namespace;
}
const mf = (k, value, type = 'single_line_text_field') => { const [namespace, key] = k.split('.'); return { namespace, key, type, value }; };

test('title parsing: stars, capacities and colour codes', async () => {
  const e = await loadEnrich();
  assert.equal(e.starsOf('iPhone 16 256GB Black Refurbished 5* M'), '5');
  assert.equal(e.capacitiesOf('MacBook Pro 16" L21 M1 Max 32GB 1TB SSD SG'), '1tb,32gb');
  assert.equal(e.capacitiesOf('HP ZBook Power G9 I7 32GB 512SSD 15"'), '32gb,512gb');
  assert.equal(e.sameColour('MacBook Pro 14" M1-Pro 16GB 512SSD SG Refurbished 4*', 'Space Grey'), true);
  assert.equal(e.sameColour('iPhone 13 Mini 128GB Red Refurbished 5*', 'Blue'), false);
});

test('a new draft gets condition from its stars and other properties only from matching references', async () => {
  const e = await loadEnrich();
  const refs = [
    { sku: 'A', title: 'MacBook Pro 16" L21 M1 Pro 16GB 512SSD SL Refurbished 4*', lead: 6, metafields: [
      mf('magento.display_diagonal', '40,64 cm (16")'), mf('magento.processor_family', 'Apple M1 Pro'), mf('magento.conditie', '4* Zeer Goed'),
      mf('magento.colour_of_product', 'Silver'), mf('magento.internal_memory', '16 GB'), mf('custom.wat_mag_je_verwachten_', 'tekst 4 sterren', 'multi_line_text_field'),
      mf('custom.dealer_price', '1480.0', 'number_decimal'), mf('magento.manufacturer', 'APPLE'), mf('judgeme.badge', '<div>', 'string'), mf('global.title_tag', 'x', 'string')] },
    { sku: 'B', title: 'MacBook Pro 16" M19 I9 32GB 1TB SSD SG Refurbished 5*', lead: 3, metafields: [
      mf('magento.colour_of_product', 'Space Grey'), mf('custom.color_swatch', 'gid://shopify/Metaobject/1', 'metaobject_reference'),
      mf('magento.internal_memory', '32 GB'), mf('magento.solid_state_drive_capacity', '1 TB'), mf('custom.wat_mag_je_verwachten_', 'tekst 5 sterren', 'multi_line_text_field'), mf('magento.processor_family', 'Intel Core i9')] },
  ];
  const r = e.enrichMetafields('MacBook Pro 16" L21 M1 Max 32GB 1TB SSD SG Refurbished 5*', refs);
  const got = Object.fromEntries(r.metafields.map(m => [m.namespace + '.' + m.key, m.value]));
  assert.deepEqual(got, {
    'magento.conditie': '5* Als Nieuw',
    'magento.colour_of_product': 'Space Grey', 'custom.color_swatch': 'gid://shopify/Metaobject/1',
    'magento.internal_memory': '32 GB', 'magento.solid_state_drive_capacity': '1 TB',
    'custom.wat_mag_je_verwachten_': 'tekst 5 sterren',
    'magento.display_diagonal': '40,64 cm (16")', 'magento.processor_family': 'Apple M1 Pro',
  });
  assert.equal(r.sources['magento.processor_family'], 'A');
  assert.equal(r.sources['magento.colour_of_product'], 'B');
  assert.equal(r.sources['magento.conditie'], 'titel');
});

test('model properties need a reference with at least three leading words in common', async () => {
  const e = await loadEnrich();
  const r = e.enrichMetafields('HP ZBook Power G9 I7 32GB 512SSD Refurbished 4*', [{ sku: 'X', title: 'HP ZBook Fury 17 G8', lead: 2, metafields: [mf('magento.processor_family', 'Intel Core i7')] }]);
  assert.deepEqual(plain(r.metafields).map(m => m.key), ['conditie']);
});

test('live draft creation sends the filled properties with the product', async () => {
  const { db } = fakeDb({ mode: 'live', createDrafts: true, rows: [csvRow(), csvRow({ 'Variant SKU [ID]': 'SKU1NEW', Title: 'iPhone 13 128GB Blue Refurbished 4*' })] });
  const { sync } = await loadModules(db);
  const fake = fakeClient([current({ title: 'iPhone 13 128GB Blue Refurbished 5*' })], { refMetafields: { 'gid://shopify/Product/1': [mf('magento.backcamera', '12 MP'), mf('magento.colour_of_product', 'Blue')] } });
  await sync.runShopifySync({ trigger: 'cron', actor: 'cron' }, { client: fake.client });
  const created = fake.mutations.find(m => m[0] === 'CreateDraftProduct')[1].input.metafields.map(m => `${m.namespace}.${m.key}=${m.value}`);
  assert.ok(created.includes('magento.conditie=4* Zeer Goed'));
  assert.ok(created.includes('magento.backcamera=12 MP'));
  assert.ok(created.includes('magento.colour_of_product=Blue'));
});
