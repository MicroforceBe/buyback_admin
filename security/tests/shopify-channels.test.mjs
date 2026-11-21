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


function fake({ scopes = ['read_publications', 'write_publications'], pubs, products = [], fail = new Set() } = {}) {
  const published = [];
  return { published, client: { graphql: async (q, v = {}) => {
    if (q.includes('AppScopes')) return { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) } };
    if (q.includes('OnlineStorePublication')) return { publications: { nodes: pubs } };
    if (q.includes('ActiveOnChannels')) {
      assert.ok(q.includes('status:active') && !q.includes('unlisted'));
      return { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: products } };
    }
    if (q.includes('PublishOnChannels')) {
      if (fail.has(v.id)) return { publishablePublish: { userErrors: [{ message: 'nope' }] } };
      published.push([v.id, v.input.map(i => i.publicationId)]); return { publishablePublish: { userErrors: [] } };
    }
    throw new Error('unexpected ' + q);
  } } };
}
const PUBS = [{ id: 'P-NULL', channels: null }, { id: 'P-POS', channels: { nodes: [{ handle: 'pos' }] } }, { id: 'P-WEB', channels: { nodes: [{ handle: 'online_store' }] } },
  { id: 'P-SHOP', channels: { nodes: [{ handle: 'shop-72' }] } }, { id: 'P-FB', channels: { nodes: [{ handle: 'facebook-ads' }] } }, { id: 'P-G', channels: { nodes: [{ handle: 'google' }] } }];

test('channelPublications: Online Store, Shop and Facebook; never Google, POS or a channel-less publication', async () => {
  const m = await load();
  const { client } = fake({ pubs: PUBS });
  assert.deepEqual(plain(await m.channelPublications(client)), { web: 'P-WEB', shop: 'P-SHOP', social: 'P-FB' });
  const { client: c2 } = fake({ pubs: PUBS.filter(p => p.id !== 'P-FB') });
  assert.deepEqual(plain(await m.channelPublications(c2)), { web: 'P-WEB', shop: 'P-SHOP' });
});

test('publishNewProduct: one call with all installed channels; reasons instead of throwing', async () => {
  const m = await load();
  const f = fake({ pubs: PUBS });
  assert.equal(await m.publishNewProduct(f.client, 'N1', { web: 'P-WEB', shop: 'P-SHOP', social: 'P-FB' }), null);
  assert.deepEqual(plain(f.published), [['N1', ['P-WEB', 'P-SHOP', 'P-FB']]]);
  assert.equal(await m.publishNewProduct(f.client, 'N2', {}), 'geen verkoopkanalen gevonden');
  const g = fake({ pubs: PUBS, fail: new Set(['N3']) });
  assert.equal(await m.publishNewProduct(g.client, 'N3', { web: 'P-WEB' }), 'nope');
  const boom = { graphql: async () => { throw new Error('netwerk'); } };
  assert.equal(await m.publishNewProduct(boom, 'N4', { web: 'P-WEB' }), 'netwerk');
});

test('publishActiveOnExtraChannels: only missing channels, only ERP products, dry run writes nothing', async () => {
  const m = await load();
  const products = [
    { id: 'A', title: 'nergens', shop: false, social: false },
    { id: 'B', title: 'alleen Shop', shop: true, social: false },
    { id: 'C', title: 'overal', shop: true, social: true },
    { id: 'D', title: 'handmatig', shop: false, social: false },
  ];
  const only = new Set(['A', 'B', 'C']);
  const dry = fake({ pubs: PUBS, products });
  const r0 = await m.publishActiveOnExtraChannels(dry.client, { dryRun: true, onlyProducts: only });
  assert.equal(r0.candidates, 2); assert.equal(dry.published.length, 0);
  const live = fake({ pubs: PUBS, products, fail: new Set(['B']) });
  const r = await m.publishActiveOnExtraChannels(live.client, { dryRun: false, onlyProducts: only });
  assert.deepEqual(plain(live.published), [['A', ['P-SHOP', 'P-FB']]]);
  assert.equal(r.published, 1); assert.equal(r.failed.length, 1); assert.deepEqual(plain(r.channels), ['Shop', 'Facebook & Instagram']);
  assert.deepEqual(plain(m.channelCounts(r)), { channelsMissing: 2, channelsPublished: 1, channelsPublishFailed: 1, channelsPublishErrors: ['alleen Shop: nope'] });
  const capped = fake({ pubs: PUBS, products });
  const rc = await m.publishActiveOnExtraChannels(capped.client, { dryRun: false, onlyProducts: only, max: 1 });
  assert.equal(rc.published, 1); assert.equal(rc.remaining, 1);
});

test('publishActiveOnExtraChannels: skipped without scopes or without the channels', async () => {
  const m = await load();
  const r1 = await m.publishActiveOnExtraChannels(fake({ pubs: PUBS, scopes: ['read_publications'] }).client, { dryRun: false });
  assert.equal(r1.status, 'skipped'); assert.match(r1.reason, /write_publications/);
  const r2 = await m.publishActiveOnExtraChannels(fake({ pubs: PUBS.filter(p => !['P-SHOP', 'P-FB'].includes(p.id)) }).client, { dryRun: false });
  assert.equal(r2.status, 'skipped');
  assert.deepEqual(plain(m.channelCounts(r2)), { channelsPublish: 'overgeslagen: Shop en Facebook & Instagram zijn niet geïnstalleerd' });
});

test('sync wiring: new drafts are published right after creation, existing active products on every run', () => {
  const sync = read('lib/shopify/sync.ts');
  assert.match(sync, /else await onCreated\(productSet\.product\.id\)/);
  assert.match(sync, /publishNewProduct\(client, productId, channelIds\)/);
  assert.equal((sync.match(/await ensureOnChannels\(/g) ?? []).length, 3);
});
