import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load() {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout, clearTimeout, Buffer, fetch: async () => { throw new Error('no network'); } });
  const modules = new Map();
  const internal = { '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/publish': 'lib/shopify/publish.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {} }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return (await ld('lib/shopify/publish.ts')).namespace;
}

function fakeClient({ scopes = ['read_publications', 'write_publications'], products, fail = new Set(), drafts = [] } = {}) {
  const published = [];
  // One product per page: also proves the scan follows every page.
  const pages = products.map(p => [p]);
  return { published, client: { graphql: async (q, v = {}) => {
    if (q.includes('AppScopes')) return { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) } };
    if (q.includes('OnlineStorePublication')) return { publications: { nodes: [{ id: 'P-NULL', channels: null }, { id: 'P-POS', channels: { nodes: [{ handle: 'pos' }] } }, { id: 'P-WEB', channels: { nodes: [{ handle: 'online_store' }] } }] } };
    if (q.includes('ActiveOnStore')) {
      assert.equal(v.pub, 'P-WEB');
      const i = v.after ? Number(v.after.slice(1)) : 0;
      const last = i === pages.length - 1;
      return { products: { pageInfo: { hasNextPage: !last, endCursor: last ? null : `c${i + 1}` }, nodes: pages[i] } };
    }
    if (q.includes('ProductsOnStore')) {
      assert.equal(v.pub, 'P-WEB');
      return { nodes: v.ids.map(id => drafts.find(d => d.id === id) ?? null) };
    }
    if (q.includes('PublishOnStore')) {
      assert.equal(v.pub, 'P-WEB');
      if (fail.has(v.id)) return { publishablePublish: { userErrors: [{ message: 'nope' }] } };
      published.push(v.id); return { publishablePublish: { userErrors: [] } };
    }
    throw new Error('unexpected ' + q);
  } } };
}

const PRODUCTS = [
  { id: 'A', title: 'iPhone 13 hidden', onStore: false },
  { id: 'B', title: 'visible', onStore: true },
  { id: 'C', title: 'iPhone 15 hidden', onStore: false },
  { id: 'D', title: 'hand-made in Shopify', onStore: false },
];

test('active ERP products that are not on the Online Store are published, across pages; others are left alone', async () => {
  const pub = await load();
  const f = fakeClient({ products: PRODUCTS, fail: new Set(['C']) });
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: false, onlyProducts: new Set(['A', 'B', 'C']) }));
  assert.deepEqual(f.published, ['A']);
  assert.equal(r.candidates, 2);
  assert.equal(r.published, 1);
  assert.deepEqual(r.failed.map(x => x.productId), ['C']);
  assert.deepEqual(plain(pub.publishCounts(r)), { onlineStoreHidden: 2, onlineStorePublished: 1, onlineStorePublishFailed: 1, onlineStorePublishErrors: ['iPhone 15 hidden: nope'] });
});

test('shadow mode only counts; missing permissions skip without writing', async () => {
  const pub = await load();
  const f = fakeClient({ products: PRODUCTS });
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: true }));
  assert.equal(r.candidates, 3);
  assert.deepEqual(f.published, []);
  const g = fakeClient({ products: PRODUCTS, scopes: ['read_products'] });
  const s = plain(await pub.publishActiveOnOnlineStore(g.client, { dryRun: false }));
  assert.equal(s.status, 'skipped');
  assert.match(s.reason, /read_publications en write_publications/);
  assert.deepEqual(plain(pub.publishCounts(s)), { onlineStorePublish: 'overgeslagen: de app mist het recht read_publications en write_publications' });
});

test('publishing stops when the sync is switched off mid-run', async () => {
  const pub = await load();
  const f = fakeClient({ products: PRODUCTS });
  let calls = 0;
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: false, stillLive: async () => ++calls < 2 }));
  assert.deepEqual(f.published, ['A']);
  assert.equal(r.remaining, 2);
});

test('the sync run counts in shadow, applies the brake to publications, skips failed products', () => {
  const sync = read('lib/shopify/sync.ts');
  assert.match(sync, /if \(mode === 'shadow'\) \{\s*await ensureOnStore\(false, new Set\(\)\);\s*return await finish\('succeeded', counts\);/);
  assert.match(sync, /if \(plan\.changes\.length \+ toPublish > settings\.max_changes\)/);
  const brake = sync.indexOf('plan.changes.length + toPublish > settings.max_changes');
  assert.ok(brake > 0 && brake < sync.indexOf('await ensureOnStore(true'), 'brake before any publish');
  assert.match(sync, /ensureOnStore\(true, new Set\(\), settings\.max_changes\)/);
  assert.match(sync, /ensureOnStore\(true, failedProducts\(failures\.map\(f => f\.id\), state\.variants\), settings\.max_changes - plan\.changes\.length\)/);
  assert.match(sync, /erpMatchedProducts\(desired\.map\(d => d\.sku\), state\.variants\)/);
  assert.match(sync, /const preview = await ensureOnStore\(false, deactivating, undefined, activating\)/);
  assert.match(sync, /plan\.productUpdates\.filter\(u => u\.status && u\.status !== 'ACTIVE'\)/);
  assert.match(sync, /const conflicted = new Set\(plan\.conflictedProducts\)/);
  assert.match(sync, /!exclude\.has\(id\) && !conflicted\.has\(id\)/);
});

test('the scan follows every page, also far beyond 40 pages', async () => {
  const pub = await load();
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `X${i}`, title: `p${i}`, onStore: i !== 55 }));
  const f = fakeClient({ products: many });
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: false }));
  assert.equal(r.candidates, 1);
  assert.deepEqual(f.published, ['X55']);
});

test('duplicate SKUs are never on the publish allowlist', async () => {
  const pub = await load();
  const r = pub.erpMatchedProducts(['A', 'B', 'C'], [
    { sku: 'A', productId: 'P1' }, { sku: 'B', productId: 'P2' }, { sku: 'B', productId: 'P3' },
    { sku: 'Z', productId: 'P4' }, { sku: null, productId: 'P5' },
  ]);
  assert.deepEqual([...r].sort(), ['P1']);
});

test('max limits the publications written in one run', async () => {
  const pub = await load();
  const f = fakeClient({ products: [{ id: 'A', title: 'a', onStore: false }, { id: 'B', title: 'b', onStore: false }, { id: 'C', title: 'c', onStore: false }] });
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: false, max: 1 }));
  assert.equal(r.published, 1);
  assert.equal(r.remaining, 2);
  assert.equal(pub.plannedPublications({ status: 'done', candidates: 500, published: 0, failed: [], remaining: 500 }), 200);
  assert.equal(pub.plannedPublications({ status: 'skipped', reason: 'x' }), 0);
});

test('products with a failed write are mapped back from variant and inventory ids', async () => {
  const pub = await load();
  const r = pub.failedProducts(['V2', 'I3', 'unknown'], [
    { productId: 'P1', variantId: 'V1', inventoryItemId: 'I1' },
    { productId: 'P2', variantId: 'V2', inventoryItemId: 'I2' },
    { productId: 'P3', variantId: 'V3', inventoryItemId: 'I3' },
  ]);
  assert.deepEqual([...r].sort(), ['P2', 'P3']);
});

test('the preview also counts products this run will activate', async () => {
  const pub = await load();
  const f = fakeClient({ products: [{ id: 'A', title: 'a', onStore: false }], drafts: [{ id: 'D1', title: 'd1', onStore: false }, { id: 'D2', title: 'd2', onStore: true }] });
  const r = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: true, activating: new Set(['A', 'D1', 'D2', 'GONE']) }));
  assert.equal(r.candidates, 2);
  const only = plain(await pub.publishActiveOnOnlineStore(f.client, { dryRun: true, onlyProducts: new Set(['A']), activating: new Set(['D1']) }));
  assert.equal(only.candidates, 1);
  assert.deepEqual(f.published, []);
});
