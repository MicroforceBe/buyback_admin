import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(entry, extra = {}) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout, clearTimeout, Buffer, encodeURIComponent });
  const modules = new Map();
  const internal = {
    '@/lib/marketing/merchantFeed': 'lib/marketing/merchantFeed.ts',
    '@/lib/marketing/merchantFeedRun': 'lib/marketing/merchantFeedRun.ts',
  };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { createHash: crypto.createHash }, ...extra }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return (await ld(entry)).namespace;
}
const feed = () => load('lib/marketing/merchantFeed.ts');

const product = (over = {}) => ({
  id: 'gid://shopify/Product/1', legacyResourceId: '1', title: 'iPhone 13 128GB Midnight Refurbished 5*', status: 'ACTIVE', vendor: 'Microforce', productType: 'Simple',
  descriptionHtml: '<p>Top <b>toestel</b> &amp; garantie</p><script>{"x":1}</script>', onlineStoreUrl: 'https://microforce.be/products/iphone-13',
  category: { name: 'Mobile & Smart Phones', fullName: 'Electronics > Communications > Telephony > Mobile & Smart Phones' },
  refurbished: { value: 'true' }, manufacturer: { value: 'APPLE' },
  media: { nodes: [{ image: { url: 'https://cdn/a.jpg' } }, {}, { image: { url: 'https://cdn/b.jpg' } }] },
  variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', legacyResourceId: '11', title: 'Default Title', sku: 'S1', barcodes: { nodes: [{ value: '885909627417' }] }, price: '449.00', compareAtPrice: '999.00', inventoryQuantity: 1 }] },
  ...over,
});

test('a refurbished webshop product becomes one Google offer with product groups', async () => {
  const f = await feed();
  const { offers, skip } = plain(f.productOffers(product(), { test: false }));
  assert.equal(skip, undefined);
  assert.equal(offers.length, 1);
  const { offerId, contentLanguage, feedLabel, productAttributes: a } = offers[0].input;
  assert.equal(offerId, '11'); // same ID as Channable: Google Ads keeps the history
  assert.equal(contentLanguage, 'nl'); assert.equal(feedLabel, 'BE');
  assert.equal(a.description, 'Top toestel & garantie');
  assert.deepEqual(a.price, { amountMicros: '449000000', currencyCode: 'EUR' }); // compare-at price (999) is never sent
  assert.equal(a.salePrice, undefined);
  assert.equal(a.availability, 'IN_STOCK'); assert.equal(a.condition, 'REFURBISHED');
  assert.equal(a.brand, 'Apple'); assert.deepEqual(a.gtins, ['885909627417']);
  assert.equal(a.googleProductCategory, '267');
  assert.deepEqual(a.additionalImageLinks, ['https://cdn/b.jpg']);
  assert.equal(a.link, 'https://microforce.be/products/iphone-13');
  assert.equal(a.itemGroupId, undefined);
  assert.deepEqual([a.customLabel0, a.customLabel1, a.customLabel2, a.customLabel3, a.customLabel4], ['Smartphone', '5 sterren', '200-499', 'Apple', 'laatste stuk']);
  assert.equal(a.excludedDestinations, undefined);
});

test('products that must not go to Google are skipped with a reason', async () => {
  const f = await feed();
  const reason = over => f.productOffers(product(over), { test: false }).skip?.reason;
  assert.equal(reason({ refurbished: { value: 'false' } }), 'niet refurbished');
  assert.equal(reason({ refurbished: null }), 'niet refurbished');
  assert.equal(reason({ onlineStoreUrl: null }), 'niet zichtbaar in de webshop');
  assert.equal(reason({ status: 'DRAFT' }), 'niet actief');
  assert.equal(reason({ media: { nodes: [] } }), 'geen foto');
});

test('test offers are prefixed and kept off every Google surface', async () => {
  const f = await feed();
  const { offers } = plain(f.productOffers(product(), { test: true }));
  assert.equal(offers[0].input.offerId, 'test-11');
  assert.ok(offers[0].input.productAttributes.excludedDestinations.includes('SHOPPING_ADS'));
  assert.ok(offers[0].input.productAttributes.excludedDestinations.includes('FREE_LISTINGS'));
});

test('variants: own link, title, group; no sale price; invalid barcode', async () => {
  const f = await feed();
  const v = (id, title, price, cmp, qty, code) => ({ id: `V${id}`, legacyResourceId: id, title, sku: null, barcodes: { nodes: code ? [{ value: code }] : [] }, price, compareAtPrice: cmp, inventoryQuantity: qty });
  const { offers } = plain(f.productOffers(product({ variants: { nodes: [v('21', '128GB', '1200.00', '1200.00', 0, '1234'), v('22', '256GB', '0', null, 3, null)] } }), { test: false }));
  assert.equal(offers.length, 1); // price 0 is never sent
  const a = offers[0].input.productAttributes;
  assert.equal(a.title, 'iPhone 13 128GB Midnight Refurbished 5* - 128GB');
  assert.equal(a.link, 'https://microforce.be/products/iphone-13?variant=21');
  assert.equal(a.itemGroupId, '1');
  assert.equal(a.salePrice, undefined);
  assert.equal(a.availability, 'OUT_OF_STOCK');
  assert.equal(a.identifierExists, false); assert.equal(a.gtins, undefined);
  assert.equal(a.customLabel2, '1000+'); assert.equal(a.customLabel4, 'uitverkocht');
});

test('helpers: GTIN check digit, brand, kind, product IDs', async () => {
  const f = await feed();
  assert.equal(f.validGtin('8718256931147'), '8718256931147');
  assert.equal(f.validGtin('8718256931148'), null);
  assert.equal(f.validGtin('00000000'), null);
  assert.equal(f.brandOf('APPLE', 'Microforce'), 'Apple');
  assert.equal(f.brandOf('HP', 'Microforce'), 'HP');
  assert.equal(f.brandOf('OEM', 'Microforce'), undefined);
  assert.equal(f.brandOf(null, 'Microforce'), undefined);
  assert.equal(f.brandOf('', 'Samsung'), 'Samsung');
  assert.equal(f.kindOf('MacBook Pro 13" M1 Refurbished 4*', 'Uncategorized'), 'Laptop');
  assert.equal(f.kindOf('Galaxy Tab S8 Refurbished', null), 'Tablet');
  assert.equal(f.kindOf('iPad 2021 64GB', null), 'Tablet');
  assert.equal(f.kindOf('APPLE MAGIC MOUSE 2 REFURBISHED', null), 'Accessoire/overig');
  assert.deepEqual(plain(f.parseProductIds('9099196629324, https://admin.shopify.com/store/x/products/9099196793164 gid://shopify/Product/9099196629324')),
    ['gid://shopify/Product/9099196629324', 'gid://shopify/Product/9099196793164']);
});

test('plan: only changed offers are sent; a test run never removes live offers', async () => {
  const f = await feed();
  const o = (id, hash) => ({ productId: 'P', hash, input: { offerId: id } });
  const now = new Date('2026-11-30T00:00:00Z');
  const recent = '2026-11-25T00:00:00Z';
  const sent = [{ offer_id: '1', hash: 'a', test: false, sent_at: recent }, { offer_id: '2', hash: 'b', test: false, sent_at: recent }, { offer_id: 'test-9', hash: 'x', test: true, sent_at: recent }];
  const live = plain(f.planFeed([o('1', 'a'), o('3', 'c')], sent, { test: false, now }));
  assert.deepEqual(live.upserts.map(u => u.input.offerId), ['3']);
  assert.deepEqual(live.deletes.sort(), ['2', 'test-9']);
  assert.equal(live.unchanged, 1);
  const t = plain(f.planFeed([o('test-8', 'z')], sent, { test: true, now }));
  assert.deepEqual(t.deletes, ['test-9']);
  assert.deepEqual(t.upserts.map(u => u.input.offerId), ['test-8']);
});

test('unchanged offers are re-sent before Google lets them expire, oldest first', async () => {
  const f = await feed();
  const o = (id, hash) => ({ productId: 'P', hash, input: { offerId: id } });
  const now = new Date('2026-11-30T00:00:00Z');
  const sent = [
    { offer_id: 'a', hash: 'h', test: false, sent_at: '2026-11-05T00:00:00Z' },
    { offer_id: 'b', hash: 'h', test: false, sent_at: '2026-11-01T00:00:00Z' },
    { offer_id: 'c', hash: 'h', test: false, sent_at: '2026-11-20T00:00:00Z' },
  ];
  const p = plain(f.planFeed([o('a', 'h'), o('b', 'h'), o('c', 'h')], sent, { test: false, now }));
  assert.deepEqual(p.refreshes.map(r => r.input.offerId), ['b', 'a']);
  assert.equal(p.upserts.length, 0);
  assert.equal(p.unchanged, 1);
  assert.equal(f.REFRESH_AFTER_DAYS < 30, true);
});

// Minimal in-memory Supabase for the run.
function fakeDb(settings, items = []) {
  const tables = { merchant_feed_settings: [{ id: true, ...settings }], merchant_feed_items: items.map(r => ({ ...r })), merchant_feed_runs: [], model_gtins: [] };
  const from = name => {
    const t = tables[name];
    let filters = [], op = 'select', payload = null, single = false, rangeOf = null;
    const q = {
      select() { return q; }, order() { return q; }, range(a, b) { rangeOf = [a, b]; return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, lt() { filters.push(() => false); return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      update(p) { op = 'update'; payload = p; return q; }, delete() { op = 'delete'; return q; },
      insert(p) { op = 'insert'; payload = p; return q; }, upsert(p) { op = 'upsert'; payload = p; return q; },
      then(res, rej) {
        try {
          const match = r => filters.every(f => f(r));
          if (op === 'insert') { const row = { id: 'run' + (t.length + 1), status: 'running', ...payload }; t.push(row); return Promise.resolve({ data: single ? row : [row], error: null }).then(res, rej); }
          if (op === 'upsert') { const i = t.findIndex(r => r.offer_id === payload.offer_id); if (i >= 0) t[i] = { ...t[i], ...payload }; else t.push({ ...payload }); return Promise.resolve({ error: null }).then(res, rej); }
          if (op === 'update') { t.filter(match).forEach(r => Object.assign(r, payload)); return Promise.resolve({ error: null }).then(res, rej); }
          if (op === 'delete') { for (let i = t.length - 1; i >= 0; i--) if (match(t[i])) t.splice(i, 1); return Promise.resolve({ error: null }).then(res, rej); }
          let rows = t.filter(match);
          if (rangeOf) rows = rows.slice(rangeOf[0], rangeOf[1] + 1);
          return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return q;
  };
  return { tables, db: { from } };
}

async function runModule() {
  return load('lib/marketing/merchantFeedRun.ts', {
    '@supabase/supabase-js': {},
    '@/lib/supabaseAdmin': { supabaseAdmin: null },
    '@/lib/shopify/client': { createShopifyClient: () => null, shopifyConfig: () => null },
    '@/lib/marketing/google': { deleteProductInput: async () => {}, googleSettings: () => ({}), deleteLocalInventory: async () => {}, insertLocalInventory: async () => {}, insertProductInput: async () => {} },
  });
}
const google = { sa: {}, account: '1', dataSource: 'accounts/1/dataSources/2' };
const shop = (products, more = {}, levels = {}) => ({ graphql: async (q, v) => q.includes('FeedMoreLevels') ? { inventoryItem: levels[v.id]?.[v.after] ?? null } : q.includes('FeedMoreVariants') ? { product: more[v.id]?.[v.after] ?? null } : q.includes('FeedProductsById') ? { nodes: v.ids.map(id => products.find(p => p.id === id) ?? null) } : { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: products } } });

test('live run sends new offers, removes gone ones, and records what was sent', async () => {
  const run = await runModule();
  const { tables, db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100 }, [{ offer_id: 'old', product_id: 'P', hash: 'h', test: false, sent_at: new Date().toISOString() }]);
  const inserted = [], removed = [];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([product(), product({ id: 'gid://shopify/Product/2', refurbished: { value: 'false' } })]), google, insert: async (g, i) => { inserted.push(i.offerId); }, remove: async (g, n) => { removed.push(n); } }));
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(inserted, ['11']);
  assert.deepEqual(removed, ['nl~BE~old']);
  assert.deepEqual(tables.merchant_feed_items.map(i => i.offer_id), ['11']);
  assert.equal(r.counts.skippedReasons['niet refurbished'], 1);
  // Second run: nothing changed, nothing sent.
  const again = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([product()]), google, insert: async () => { throw new Error('should not send'); }, remove: async () => { throw new Error('should not remove'); } }));
  assert.equal(again.status, 'succeeded');
  assert.equal(again.counts.unchanged, 1);
});

test('the brake stops a run before anything is sent; off mode does nothing', async () => {
  const run = await runModule();
  const { db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 1 });
  const two = [product(), product({ id: 'gid://shopify/Product/2', legacyResourceId: '2', variants: { nodes: [{ ...product().variants.nodes[0], legacyResourceId: '12' }] } })];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop(two), google, insert: async () => { throw new Error('no'); }, remove: async () => { throw new Error('no'); } }));
  assert.equal(r.status, 'stopped');
  assert.match(r.error, /Noodrem/);
  const off = fakeDb({ mode: 'off', data_source: null, test_products: [], max_changes: 1 });
  assert.equal(plain(await run.runMerchantFeed({ trigger: 'cron', actor: 't' }, { db: off.db, client: shop([]), google })).status, 'skipped');
});

test('test run only loads the listed products and failures are reported per offer', async () => {
  const run = await runModule();
  const { tables, db } = fakeDb({ mode: 'test', data_source: google.dataSource, test_products: ['gid://shopify/Product/1'], max_changes: 100 }, [{ offer_id: '55', product_id: 'P', hash: 'h', test: false, sent_at: new Date().toISOString() }]);
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([product()]), google, insert: async () => { throw new Error('Google zegt nee'); }, remove: async () => { throw new Error('live offer must stay'); } }));
  assert.equal(r.status, 'failed');
  assert.deepEqual(r.counts.errors, [{ offerId: 'test-11', reason: 'Google zegt nee' }]);
  assert.deepEqual(tables.merchant_feed_items.map(i => i.offer_id), ['55']);
});

test('wiring: cron route needs the secret, runs 5 minutes after the Shopify sync; actions are admin-only', () => {
  const route = read('app/api/merchant-feed/route.ts');
  assert.match(route, /bearerMatches\(request\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/);
  const crons = JSON.parse(read('vercel.json')).crons;
  assert.ok(crons.some(c => c.path === '/api/merchant-feed' && c.schedule === '10-59/15 * * * *'));
  const actions = read('app/admin/marketing/actions.ts');
  for (const name of ['createFeedDataSourceAction', 'saveFeedSettingsAction', 'runFeedAction', 'saveStoreCodesAction', 'saveGtinsAction']) {
    const body = actions.slice(actions.indexOf(`export async function ${name}`));
    assert.match(body.slice(0, 200), /requireAccess\('erp', 'write', true\)/, name);
  }
  assert.match(actions, /mode === 'live' && form\.get\('channable_off'\) !== 'on'/);
  const sql = read('security/sql/merchant-feed.sql');
  assert.match(sql, /mode text not null default 'off'/);
  assert.match(sql, /enable row level security/);
});

test('the ledger is read page by page, so a large feed is never treated as new', async () => {
  const run = await runModule();
  const p = product();
  const f = await feed();
  const offer = f.productOffers(p, { test: false }).offers[0];
  const many = Array.from({ length: 2500 }, (_, i) => ({ offer_id: `z${String(i).padStart(5, '0')}`, product_id: 'P', hash: 'h', test: false, sent_at: new Date().toISOString() }));
  many.push({ offer_id: '11', product_id: p.id, hash: offer.hash, test: false, sent_at: new Date().toISOString() });
  const { db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 5000 }, many);
  const removed = [];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p]), google, insert: async () => { throw new Error('unchanged offer must not be sent'); }, remove: async (g, n) => { removed.push(n); } }));
  assert.equal(r.counts.toRemove, 2500);
  assert.equal(r.counts.unchanged, 1);
  assert.equal(r.counts.toSend, 0);
});

test('products with more than one page of variants are completed before planning', async () => {
  const run = await runModule();
  const base = product();
  const v = id => ({ ...base.variants.nodes[0], id: `V${id}`, legacyResourceId: id });
  const p = product({ variants: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [v('31')] } });
  const more = { [p.id]: { c1: { variants: { pageInfo: { hasNextPage: true, endCursor: 'c2' }, nodes: [v('32')] } }, c2: { variants: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [v('33')] } } } };
  const { db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100 });
  const sent = [];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p], more), google, insert: async (g, i) => { sent.push(i.offerId); }, remove: async () => {} }));
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(sent.sort(), ['31', '32', '33']);
});

test('availability follows what the webshop can sell, not the total over all stores', async () => {
  const f = await feed();
  const base = product().variants.nodes[0];
  const a = q => plain(f.productOffers(product({ variants: { nodes: [{ ...base, ...q }] } }), { test: false })).offers[0].input.productAttributes;
  assert.equal(a({ inventoryQuantity: 3, sellableOnlineQuantity: 0 }).availability, 'OUT_OF_STOCK');
  assert.equal(a({ inventoryQuantity: 3, sellableOnlineQuantity: 0 }).customLabel4, 'uitverkocht');
  assert.equal(a({ inventoryQuantity: 0, sellableOnlineQuantity: 2 }).availability, 'IN_STOCK');
});

const ANT = 'gid://shopify/Location/1', GENT = 'gid://shopify/Location/2', OUD = 'gid://shopify/Location/3';
const levels = (a, g, o) => ({ inventoryLevels: { nodes: [[ANT, a], [GENT, g], [OUD, o]].map(([id, q]) => ({ location: { id }, quantities: [{ name: 'available', quantity: q }] })) } });

test('stock per store only for stores with a store code, stable order', async () => {
  const f = await feed();
  const v = { ...product().variants.nodes[0], inventoryItem: levels(0, 2, -1) };
  assert.deepEqual(plain(f.localInventories(v, { [GENT]: 'GENTBRUGGE', [ANT]: 'ANTWERPEN' })), [
    { storeCode: 'ANTWERPEN', localInventoryAttributes: { availability: 'OUT_OF_STOCK', quantity: '0' } },
    { storeCode: 'GENTBRUGGE', localInventoryAttributes: { availability: 'IN_STOCK', quantity: '2' } },
  ]);
  const none = plain(f.productOffers(product(), { test: false }));
  assert.deepEqual(none.offers[0].local, []);
  assert.equal(none.offers[0].localHash, '');
  // The stock per store is not part of the offer hash: a stock move between stores does not resend the offer.
  const a = f.productOffers(product({ variants: { nodes: [{ ...product().variants.nodes[0], inventoryItem: levels(1, 0, 0) }] } }), { test: false, storeCodes: { [ANT]: 'ANTWERPEN', [GENT]: 'GENTBRUGGE' } }).offers[0];
  const b = f.productOffers(product({ variants: { nodes: [{ ...product().variants.nodes[0], inventoryItem: levels(0, 1, 0) }] } }), { test: false, storeCodes: { [ANT]: 'ANTWERPEN', [GENT]: 'GENTBRUGGE' } }).offers[0];
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.localHash, b.localHash);
});

test('plan: stock per store only for offers Google already has; changed, removed store or ageing', async () => {
  const f = await feed();
  const inv = code => ({ storeCode: code, localInventoryAttributes: { availability: 'IN_STOCK', quantity: '1' } });
  const o = (id, localHash, codes) => ({ productId: 'P', hash: 'h', localHash, local: codes.map(inv), input: { offerId: id } });
  const now = new Date('2026-11-30T00:00:00Z');
  const recent = '2026-11-29T00:00:00Z', old = '2026-11-01T00:00:00Z';
  const row = (id, extra) => ({ offer_id: id, hash: 'h', test: false, sent_at: recent, local_hash: 'L', local_stores: ['A'], local_sent_at: recent, ...extra });
  const sent = [row('same'), row('moved'), row('localOld', { local_sent_at: old }), row('productOld', { sent_at: old }), row('codeGone'), row('codeChanged')];
  const p = plain(f.planFeed([o('same', 'L', ['A']), o('moved', 'M', ['A']), o('localOld', 'L', ['A']), o('productOld', 'L', ['A']), o('codeGone', '', []), o('codeChanged', 'N', ['B']), o('new', 'L', ['A'])], sent, { test: false, now }));
  const byId = Object.fromEntries(p.local.map(u => [u.offer.input.offerId, u.removeStores]));
  assert.deepEqual(Object.keys(byId).sort(), ['codeChanged', 'codeGone', 'localOld', 'moved']);
  assert.deepEqual(byId.codeGone, ['A']);
  assert.deepEqual(byId.codeChanged, ['A']);
  assert.deepEqual(byId.moved, []);
});

test('run sends the stock per store for offers sent earlier and remembers it', async () => {
  const run = await runModule();
  const f = await feed();
  const codes = { [ANT]: 'ANTWERPEN', [GENT]: 'GENTBRUGGE' };
  const p = product({ variants: { nodes: [{ ...product().variants.nodes[0], inventoryItem: levels(0, 1, 0) }] } });
  const offer = f.productOffers(p, { test: false, storeCodes: codes }).offers[0];
  const { tables, db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100, store_codes: codes },
    [{ offer_id: '11', product_id: p.id, hash: offer.hash, test: false, sent_at: new Date().toISOString(), local_hash: null }]);
  const local = [];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p]), google, insert: async () => { throw new Error('unchanged'); }, remove: async () => {}, insertLocal: async (g, name, inv) => { local.push([name, inv.storeCode, inv.localInventoryAttributes.availability]); } }));
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(local, [['nl~BE~11', 'ANTWERPEN', 'OUT_OF_STOCK'], ['nl~BE~11', 'GENTBRUGGE', 'IN_STOCK']]);
  assert.equal(tables.merchant_feed_items[0].local_hash, offer.localHash);
  assert.deepEqual(plain(tables.merchant_feed_items[0].local_stores), ['ANTWERPEN', 'GENTBRUGGE']);
  assert.ok(tables.merchant_feed_items[0].local_sent_at);
  assert.equal(r.counts.localSent, 1);
  // A store that loses its code: its stock is removed at Google, the other store is sent again.
  const removed = [], sentAgain = [];
  const one = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db: { from: n => n === 'merchant_feed_settings' ? fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100, store_codes: { [GENT]: 'GENTBRUGGE' } }).db.from(n) : db.from(n) }, client: shop([p]), google, insert: async () => {}, remove: async () => {}, insertLocal: async (g, n, inv) => { sentAgain.push(inv.storeCode); }, removeLocal: async (g, n, code) => { removed.push(code); } }));
  assert.equal(one.status, 'succeeded');
  assert.deepEqual(removed, ['ANTWERPEN']);
  assert.deepEqual(sentAgain, ['GENTBRUGGE']);
  assert.deepEqual(plain(tables.merchant_feed_items[0].local_stores), ['GENTBRUGGE']);
  // Same codes as last time and nothing changed: nothing is sent.
  tables.merchant_feed_settings[0].store_codes = { [GENT]: 'GENTBRUGGE' };
  const again = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p]), google, insert: async () => { throw new Error('x'); }, remove: async () => {}, insertLocal: async () => { throw new Error('no local resend'); }, removeLocal: async () => { throw new Error('no removal'); } }));
  assert.equal(again.status, 'succeeded');
  // A new offer gets its stock per store only in a later run (Google must know the product first).
  const fresh = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100, store_codes: codes });
  const first = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db: fresh.db, client: shop([p]), google, insert: async () => {}, remove: async () => {}, insertLocal: async () => { throw new Error('too early'); } }));
  assert.equal(first.status, 'succeeded');
  assert.equal(first.counts.localToSend, 0);
});

test('stock levels beyond the first page of locations are fetched before planning the stores', async () => {
  const run = await runModule();
  const codes = { [ANT]: 'ANTWERPEN', [OUD]: 'OUDENAARDE' };
  const lvl = (id, q) => ({ location: { id }, quantities: [{ name: 'available', quantity: q }] });
  const v = { ...product().variants.nodes[0], inventoryItem: { id: 'I1', inventoryLevels: { pageInfo: { hasNextPage: true, endCursor: 'k1' }, nodes: [lvl(ANT, 1)] } } };
  const p = product({ variants: { nodes: [v] } });
  const levels = { I1: { k1: { inventoryLevels: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [lvl(OUD, 3)] } } } };
  const fresh = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100, store_codes: codes });
  await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db: fresh.db, client: shop([p], {}, levels), google, insert: async () => {}, remove: async () => {} });
  const sent = [];
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db: fresh.db, client: shop([p], {}, levels), google, insert: async () => {}, remove: async () => {}, insertLocal: async (g, n, inv) => { sent.push([inv.storeCode, inv.localInventoryAttributes.quantity]); }, removeLocal: async () => { throw new Error('nothing to remove'); } }));
  assert.equal(r.status, 'succeeded');
  assert.deepEqual(sent, [['ANTWERPEN', '1'], ['OUDENAARDE', '3']]);
});

test('a partial store failure still remembers the stores written, for later removal', async () => {
  const run = await runModule();
  const f = await feed();
  const codes = { [ANT]: 'ANTWERPEN', [GENT]: 'GENTBRUGGE' };
  const p = product({ variants: { nodes: [{ ...product().variants.nodes[0], inventoryItem: levels(1, 1, 0) }] } });
  const offer = f.productOffers(p, { test: false, storeCodes: codes }).offers[0];
  const { tables, db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100, store_codes: codes },
    [{ offer_id: '11', product_id: p.id, hash: offer.hash, test: false, sent_at: new Date().toISOString(), local_hash: 'previous', local_stores: [], local_sent_at: new Date().toISOString() }]);
  const r = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p]), google, insert: async () => {}, remove: async () => {},
    insertLocal: async (g, n, inv) => { if (inv.storeCode === 'ANTWERPEN') throw new Error('Google zegt nee'); } }));
  assert.equal(r.status, 'failed');
  assert.match(r.counts.errors[0].reason, /ANTWERPEN: Google zegt nee/);
  // The failing first store does not stop the second one.
  assert.deepEqual(plain(tables.merchant_feed_items[0].local_stores), ['GENTBRUGGE']);
  assert.equal(tables.merchant_feed_items[0].local_hash, null);
  // All codes cleared: Gentbrugge's stock is removed at Google.
  tables.merchant_feed_settings[0].store_codes = {};
  const removed = [];
  const again = plain(await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([p]), google, insert: async () => {}, remove: async () => {}, insertLocal: async () => {}, removeLocal: async (g, n, code) => { removed.push(code); } }));
  assert.equal(again.status, 'succeeded');
  assert.deepEqual(removed, ['GENTBRUGGE']);
  assert.deepEqual(plain(tables.merchant_feed_items[0].local_stores), []);
});

test('colour, storage/memory and highlights from the title; only facts that always hold', async () => {
  const f = await feed();
  assert.equal(f.colorOf('iPhone 14 Pro 256GB Space Black Refurbished 4*'), 'Space Black');
  assert.equal(f.colorOf('iPhone 13 128GB Midnight Refurbished 5* M'), 'Midnight');
  assert.equal(f.colorOf('MacBook Air 13" L20 M1 8GB 256SSD SG Refurbished 4*'), 'Space Grey');
  assert.equal(f.colorOf('Dell Latitude 5320 I5 8GB 256SSD 13" W11 Refurbished 4*'), undefined);
  assert.deepEqual(plain(f.specsOf('iPhone 13 128GB Midnight Refurbished 5*', 'Smartphone')), { storage: '128 GB' });
  assert.deepEqual(plain(f.specsOf('MacBook Pro 16" E23 M2- Pro 16GB 1TB SSD SG Refurbished 4*', 'Laptop')), { storage: '1 TB SSD', memory: '16 GB' });
  assert.deepEqual(plain(f.specsOf('Dell Latitude 5320 I5 8GB 256SSD 13" W11 Refurbished 4*', 'Laptop')), { storage: '256 GB SSD', memory: '8 GB' });
  assert.deepEqual(plain(f.specsOf('APPLE MAGIC MOUSE 2 REFURBISHED', 'Accessoire/overig')), {});
  assert.deepEqual(plain(f.highlightsOf('Smartphone', 'Apple', '5')), ['Premium originele kwaliteit', 'Batterij minimaal 85% of kies een nieuwe batterij', '2 jaar garantie', 'Gecontroleerd op 50 punten', 'Met kwaliteitsgarantie']);
  assert.deepEqual(plain(f.highlightsOf('Laptop', 'Dell', '3')), ['Batterij minimaal 85% of kies een nieuwe batterij', 'Gecontroleerd op 50 punten', 'Met kwaliteitsgarantie']);
  assert.deepEqual(plain(f.highlightsOf('Accessoire/overig', 'Apple', '5')), []);
  for (const h of f.highlightsOf('Smartphone', 'Apple', '5')) assert.doesNotMatch(h, /verzend|retour|€|gratis|prijs/i); // Google: no price/shipping/returns
  const a = plain(f.productOffers(product(), { test: false })).offers[0].input.productAttributes;
  assert.equal(a.color, 'Midnight');
  assert.equal(a.productHighlights.length, 5);
  assert.deepEqual(a.productDetails, [
    { sectionName: 'Specificaties', attributeName: 'Opslagcapaciteit', attributeValue: '128 GB' },
    { sectionName: 'Staat', attributeName: 'Kwaliteitsklasse', attributeValue: '5 sterren' },
  ]);
});

test('variant title wins for colour and storage; full titanium finish names', async () => {
  const f = await feed();
  assert.equal(f.colorOf('iPhone 16 Pro 256GB White Titanium Refurbished 5* M'), 'White Titanium');
  assert.equal(f.colorOf('iPhone 16 Pro 128GB Black Titanium Refurbished 4*'), 'Black Titanium');
  const base = product().variants.nodes[0];
  const offers = plain(f.productOffers(product({ variants: { nodes: [{ ...base, legacyResourceId: '41', title: '256GB / Blue' }, { ...base, legacyResourceId: '42', title: 'Default variant' }] } }), { test: false })).offers;
  const a = offers[0].input.productAttributes, b = offers[1].input.productAttributes;
  assert.equal(a.color, 'Blue');
  assert.equal(a.productDetails[0].attributeValue, '256 GB');
  assert.equal(b.color, 'Midnight');
  assert.equal(b.productDetails[0].attributeValue, '128 GB');
});

test('a single variant with a meaningful title also wins for colour and storage', async () => {
  const f = await feed();
  const base = product().variants.nodes[0];
  const a = plain(f.productOffers(product({ variants: { nodes: [{ ...base, title: '256GB / Blue' }] } }), { test: false })).offers[0].input.productAttributes;
  assert.equal(a.color, 'Blue');
  assert.equal(a.productDetails[0].attributeValue, '256 GB');
  assert.equal(a.title, 'iPhone 13 128GB Midnight Refurbished 5*'); // the offer title stays the product title for a single variant
});

test('model key: every grade of one model shares one key', async () => {
  const f = await feed();
  const same = ['iPhone 13 128GB Midnight Refurbished 5* M', 'iPhone 13 128GB Midnight Refurbished 4*', 'iPhone 13 128GB Midnight Refurbished 3* M'];
  assert.deepEqual([...new Set(same.map(f.modelKey))], ['iphone 13 128gb midnight']);
  assert.equal(f.modelKey('iPhone 15 Pro Max 256GB Naturel Titanium Refurbished 4*'), 'iphone 15 pro max 256gb natural titanium');
  assert.equal(f.modelKey('Apple Watch Series 10 Alu 46mm Silver/Wit GPS 4G Refur 4*M'), 'apple watch series 10 alu 46mm silver/white gps 4g');
  assert.equal(f.modelKey('iPhone 13 128GB Rood Refurbished 4*'), f.modelKey('iPhone 13 128GB Red Refurbished 5* M'));
  assert.equal(f.modelKey('iPhone 13 256GB Sterrenlicht Refurbished'), 'iphone 13 256gb starlight');
  const byModel = f.gtinsByModel([{ model_key: 'iphone 13 128gb rood', gtin: '1' }, { model_key: 'iphone 13 128gb red', gtin: '2' }, { model_key: 'iphone 14 128gb rood', gtin: '3' }]);
  assert.deepEqual([...byModel].map(([k, r]) => [k, r.gtin]).sort(), [['iphone 13 128gb red', '2'], ['iphone 14 128gb red', '3']]);
  assert.equal(f.modelKey('iPhone SE 2022 256GB Midhight Refurbished 5*'), 'iphone se 2022 256gb midnight');
  assert.equal(f.modelKey('iPhone 12 Mini 128 Black Refurbished 4*'), 'iphone 12 mini 128gb black');
  assert.equal(f.modelKey('iPhone 16 Pro 256 GB Black Titanium Refurbished'), 'iphone 16 pro 256gb black titanium');
  assert.equal(f.modelKey('iPad Pro 5 12,9" 2021 128G Wifi 5G Silver Refurbished'), 'ipad pro 5 12,9" 2021 128gb wifi 5g silver');
  assert.equal(f.modelKey('Apple Watch Series Ultra3 49mm Black Titan./Black GPS 5G 5*M'), 'apple watch series ultra3 49mm black titanium/black gps 5g');
  assert.equal(f.modelKey('APPLE MAGIC MOUSE 2 REFURBISHED'), 'apple magic mouse 2');
  assert.equal(f.modelKey('MacBook Air 15" L23 M2 16GB 1TB SSD SG (Nieuw In Box)'), 'macbook air 15" l23 m2 16gb 1tb ssd sg');
  assert.equal(f.modelKey('iPad Air 6 11" 2024 M2 512GB Wifi Blue - Nieuw'), 'ipad air 6 11" 2024 m2 512gb wifi blue');
  assert.equal(f.modelKey('iPad Pro 11" 2022 256GB Wifi SpaceGrey Refurbished 5* M'), 'ipad pro 11" 2022 256gb wifi space grey');
});

test('the model GTIN is used when the variant has no barcode; the own barcode wins', async () => {
  const f = await feed();
  const gtins = new Map([['iphone 13 128gb midnight', '0194252707289']]);
  const base = product().variants.nodes[0];
  const none = plain(f.productOffers(product({ variants: { nodes: [{ ...base, barcodes: { nodes: [] } }] } }), { test: false, gtins })).offers[0].input.productAttributes;
  assert.deepEqual(none.gtins, ['0194252707289']);
  assert.equal(none.identifierExists, undefined);
  const own = plain(f.productOffers(product(), { test: false, gtins })).offers[0].input.productAttributes;
  assert.deepEqual(own.gtins, ['885909627417']);
  const other = plain(f.productOffers(product({ variants: { nodes: [{ ...base, title: '256GB / Blue', barcodes: { nodes: [] } }] } }), { test: false, gtins })).offers[0].input.productAttributes;
  assert.equal(other.gtins, undefined); // a variant with its own configuration never gets the title model's GTIN
  assert.equal(other.identifierExists, false);
  const bad = plain(f.productOffers(product({ variants: { nodes: [{ ...base, barcodes: { nodes: [] } }] } }), { test: false, gtins: new Map([['iphone 13 128gb midnight', '1234']]) })).offers[0].input.productAttributes;
  assert.equal(bad.identifierExists, false);
});

test('the run reads the model GTINs', async () => {
  const run = await runModule();
  const { tables, db } = fakeDb({ mode: 'live', data_source: google.dataSource, test_products: [], max_changes: 100 });
  tables.model_gtins.push({ model_key: 'iphone 13 128gb midnight', gtin: '0194252707289' });
  const base = product().variants.nodes[0];
  const sent = [];
  await run.runMerchantFeed({ trigger: 'manual', actor: 't' }, { db, client: shop([product({ variants: { nodes: [{ ...base, barcodes: { nodes: [] } }] } })]), google, insert: async (g, i) => { sent.push(i.productAttributes.gtins); }, remove: async () => {} });
  assert.deepEqual(plain(sent), [['0194252707289']]);
  const actions = read('app/admin/marketing/actions.ts');
  assert.match(actions, /validGtin\(rawGtin/);
  assert.match(read('security/sql/model-gtins.sql'), /enable row level security/);
});

test('saving or withdrawing a GTIN also removes rows stored under an older spelling of that model', () => {
  const actions = fs.readFileSync(new URL('../../app/admin/marketing/actions.ts', import.meta.url), 'utf8');
  assert.match(actions, /if \(k !== modelKey\(k\) && touched\.has\(modelKey\(k\)\)\) legacy\.push\(k\)/);
  assert.match(actions, /const toDelete = \[\.\.\.new Set\(\[\.\.\.removals, \.\.\.legacy\]\)\];/);
});
