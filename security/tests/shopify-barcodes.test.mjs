import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load() {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout, clearTimeout, Buffer, fetch: async () => { throw new Error('no network'); } });
  const modules = new Map();
  const internal = { '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/marketing/merchantFeed': 'lib/marketing/merchantFeed.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { createHash: crypto.createHash, randomUUID: crypto.randomUUID } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return (await ld('lib/shopify/modelBarcodes.ts')).namespace;
}

const GTIN = '0194252707289';   // valid check digit
const OTHER = '0194252707296';  // valid check digit
const variant = (over = {}) => ({ id: 'V1', title: 'Default Title', sku: '211000000001', barcodes: { nodes: [] }, marker: null, ...over });
const product = (over = {}, v = [variant()]) => ({ id: 'P1', title: 'iPhone 13 128GB Midnight Refurbished 5*', status: 'ACTIVE', refurbished: { value: 'true' }, variants: { nodes: v }, ...over });
const gtins = (code = GTIN) => new Map([['iphone 13 128gb midnight', code]]);

test('check digits of the fixtures are valid', async () => {
  const { planModelBarcodes } = await load();
  assert.equal(plain(planModelBarcodes([product()], gtins(OTHER))).length, 1);
});

test('fills only refurbished, non-archived, plain variants without a barcode', async () => {
  const { planModelBarcodes } = await load();
  const out = plain(planModelBarcodes([
    product(),
    product({ id: 'P2', status: 'DRAFT' }, [variant({ id: 'V2' })]),
    product({ id: 'P3', status: 'ARCHIVED' }, [variant({ id: 'V3' })]),
    product({ id: 'P4', refurbished: { value: 'false' } }, [variant({ id: 'V4' })]),
    product({ id: 'P5', refurbished: null }, [variant({ id: 'V5' })]),
    product({ id: 'P6' }, [variant({ id: 'V6', title: '256GB / Blue' })]),
    product({ id: 'P7', title: 'iPhone 99 1TB Gold Refurbished 5*' }, [variant({ id: 'V7' })]),
  ], gtins()));
  assert.deepEqual(out.map(c => [c.variantId, c.action, c.to]), [['V1', 'fill', GTIN], ['V2', 'fill', GTIN]]);
});

test('never touches a barcode the tool did not write', async () => {
  const { planModelBarcodes } = await load();
  const out = planModelBarcodes([
    product({}, [variant({ barcodes: { nodes: [{ value: OTHER }] } })]),
    product({ id: 'P2' }, [variant({ id: 'V2', barcodes: { nodes: [{ value: OTHER }] }, marker: { value: GTIN } })]),
    product({ id: 'P3' }, [variant({ id: 'V3', barcodes: { nodes: [{ value: OTHER }, { value: '123' }] }, marker: { value: OTHER } })]),
  ], gtins());
  assert.equal(out.length, 0);
});

test('corrects or withdraws only its own code', async () => {
  const { planModelBarcodes } = await load();
  const own = variant({ barcodes: { nodes: [{ value: OTHER }] }, marker: { value: OTHER } });
  assert.deepEqual(plain(planModelBarcodes([product({}, [own])], gtins())).map(c => [c.action, c.from, c.to]), [['fix', OTHER, GTIN]]);
  assert.deepEqual(plain(planModelBarcodes([product({}, [own])], new Map([['other', GTIN]]))).map(c => [c.action, c.to]), [['clear', null]]);
  assert.equal(planModelBarcodes([product({}, [variant({ barcodes: { nodes: [{ value: GTIN }] }, marker: { value: GTIN } })])], gtins()).length, 0);
});

function fakeClient(products, { errorFor = new Set() } = {}) {
  const writes = [];
  return { writes, client: { graphql: async (q, v = {}) => {
    if (q.includes('ModelBarcodeProducts')) {
      const i = v.after ? Number(v.after) : 0;
      return { products: { pageInfo: { hasNextPage: i < products.length - 1, endCursor: String(i + 1) }, nodes: [products[i]] } };
    }
    if (q.includes('productVariantsBulkUpdate')) {
      writes.push(plain(v));
      return { productVariantsBulkUpdate: { userErrors: errorFor.has(v.productId) ? [{ field: ['barcodes'], message: 'ongeldig' }] : [] } };
    }
    throw new Error('unexpected query');
  } } };
}

test('run: pages every product, writes barcode plus marker, respects dry run, max and errors', async () => {
  const { syncModelBarcodes, MARKER } = await load();
  const list = [product(), product({ id: 'P2' }, [variant({ id: 'V2' })]), product({ id: 'P3' }, [variant({ id: 'V3', barcodes: { nodes: [{ value: OTHER }] }, marker: { value: OTHER } })])];

  const dry = fakeClient(list);
  const d = plain(await syncModelBarcodes(dry.client, gtins(), { dryRun: true }));
  assert.equal(dry.writes.length, 0);
  assert.deepEqual([d.candidates, d.filled, d.fixed, d.remaining], [3, 2, 1, 3]);

  const live = fakeClient(list, { errorFor: new Set(['P2']) });
  const r = plain(await syncModelBarcodes(live.client, gtins(), { dryRun: false }));
  assert.deepEqual(live.writes[0], { productId: 'P1', variants: [{ id: 'V1', barcodes: [{ value: GTIN }], metafields: [{ ...plain(MARKER), value: GTIN }] }] });
  assert.deepEqual([r.filled, r.fixed, r.failed.length, r.remaining], [1, 1, 1, 1]);

  const capped = fakeClient(list);
  const c = plain(await syncModelBarcodes(capped.client, gtins(), { dryRun: false, max: 1 }));
  assert.deepEqual([capped.writes.length, c.filled, c.remaining], [1, 1, 2]);
});

test('run: an empty GTIN table writes nothing (no accidental clears)', async () => {
  const { syncModelBarcodes } = await load();
  const f = fakeClient([product({}, [variant({ barcodes: { nodes: [{ value: GTIN }] }, marker: { value: GTIN } })])]);
  const r = plain(await syncModelBarcodes(f.client, new Map(), { dryRun: false }));
  assert.equal(r.status, 'skipped');
  assert.equal(f.writes.length, 0);
});

test('clear sends an empty barcode set and marks the code as withdrawn in the same mutation', async () => {
  const { syncModelBarcodes, MARKER, WITHDRAWN, planModelBarcodes } = await load();
  const f = fakeClient([product({}, [variant({ barcodes: { nodes: [{ value: GTIN }] }, marker: { value: GTIN } })])]);
  await syncModelBarcodes(f.client, new Map([['other', OTHER]]), { dryRun: false });
  assert.deepEqual(f.writes[0].variants, [{ id: 'V1', barcodes: [], metafields: [{ ...plain(MARKER), value: WITHDRAWN }] }]);
  // A code typed in again later is not ours anymore.
  assert.equal(planModelBarcodes([product({}, [variant({ barcodes: { nodes: [{ value: GTIN }] }, marker: { value: WITHDRAWN } })])], new Map([['other', OTHER]])).length, 0);
});

test('run: pages past 100 pages and fails loudly at the safety stop', async () => {
  const { syncModelBarcodes } = await load();
  const many = Array.from({ length: 150 }, (_, i) => product({ id: 'P' + i }, [variant({ id: 'V' + i })]));
  const f = fakeClient(many);
  const r = plain(await syncModelBarcodes(f.client, gtins(), { dryRun: true }));
  assert.equal(r.candidates, 150);
  const endless = { graphql: async (q, v) => ({ products: { pageInfo: { hasNextPage: true, endCursor: String(Number(v.after ?? 0) + 1) }, nodes: [] } }) };
  await assert.rejects(syncModelBarcodes(endless, gtins(), { dryRun: true }), /pagina's/);
});

test('cron route is scheduled and protected; the button is admin-only', () => {
  const cron = JSON.parse(read('vercel.json')).crons.find(c => c.path === '/api/shopify-barcodes');
  assert.ok(cron);
  assert.match(read('app/api/shopify-barcodes/route.ts'), /bearerMatches\(request\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/);
  const actions = read('app/admin/marketing/actions.ts');
  assert.match(actions, /export async function runModelBarcodesAction\(\) \{\n  await requireAccess\('erp', 'write', true\);/);
  assert.match(read('lib/shopify/modelBarcodesRun.ts'), /dryRun: settings\.mode !== 'live'/);
});
