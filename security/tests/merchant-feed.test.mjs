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
  assert.deepEqual(a.price, { amountMicros: '999000000', currencyCode: 'EUR' });
  assert.deepEqual(a.salePrice, { amountMicros: '449000000', currencyCode: 'EUR' });
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

test('variants: own link, title, group; no sale price when compare-at is not higher; invalid barcode', async () => {
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
  const tables = { merchant_feed_settings: [{ id: true, ...settings }], merchant_feed_items: items.map(r => ({ ...r })), merchant_feed_runs: [] };
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
          if (op === 'upsert') { const i = t.findIndex(r => r.offer_id === payload.offer_id); if (i >= 0) t[i] = payload; else t.push(payload); return Promise.resolve({ error: null }).then(res, rej); }
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
    '@/lib/marketing/google': { deleteProductInput: async () => {}, googleSettings: () => ({}), insertProductInput: async () => {} },
  });
}
const google = { sa: {}, account: '1', dataSource: 'accounts/1/dataSources/2' };
const shop = products => ({ graphql: async (q, v) => q.includes('FeedProductsById') ? { nodes: v.ids.map(id => products.find(p => p.id === id) ?? null) } : { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: products } } });

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
  for (const name of ['createFeedDataSourceAction', 'saveFeedSettingsAction', 'runFeedAction']) {
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
