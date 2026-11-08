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

function fakeClient({ scopes = ['read_publications', 'write_publications'], products, fail = new Set() } = {}) {
  const published = [];
  const pages = [products.slice(0, 2), products.slice(2)];
  return { published, client: { graphql: async (q, v = {}) => {
    if (q.includes('AppScopes')) return { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) } };
    if (q.includes('OnlineStorePublication')) return { publications: { nodes: [{ id: 'P-POS', channels: { nodes: [{ handle: 'pos' }] } }, { id: 'P-WEB', channels: { nodes: [{ handle: 'online_store' }] } }] } };
    if (q.includes('ActiveOnStore')) {
      assert.equal(v.pub, 'P-WEB');
      const i = v.after ? 1 : 0;
      return { products: { pageInfo: { hasNextPage: i === 0, endCursor: i === 0 ? 'c1' : null }, nodes: pages[i] } };
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

test('the sync run publishes in shadow (count only), when nothing changed, and after writes', () => {
  const sync = read('lib/shopify/sync.ts');
  assert.match(sync, /await ensureOnStore\(mode !== 'shadow'\);\s*return await finish\('succeeded', counts\);/);
  assert.match(sync, /await ensureOnStore\(true\);/);
  assert.match(sync, /onlyProducts: erpProducts/);
});
