import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(db = null) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout });
  const modules = new Map();
  const internal = { '@/lib/shopify/enrich': 'lib/shopify/enrich.ts', '@/lib/shopify/plan': 'lib/shopify/plan.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/catalog': 'lib/shopify/catalog.ts', '@/lib/shopify/catalogRun': 'lib/shopify/catalogRun.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { randomUUID: () => 'k' }, '@/lib/supabaseAdmin': { supabaseAdmin: db } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return { catalog: (await ld('lib/shopify/catalog.ts')).namespace, run: (await ld('lib/shopify/catalogRun.ts')).namespace };
}

const P = (n, over = {}) => ({
  id: `gid://shopify/Product/${n}`, title: `iPhone 13 128GB Blauw 4*`, handle: `p${n}`, status: 'ACTIVE', tags: ['cat_smartphones'], totalInventory: 1,
  condition: '4* Zeer Goed', colour: 'Blauw', refurbished: true, skus: [`20500000000${n}`], images: [{ width: 1200, height: 1200 }], collections: 1, ...over,
});

test('the bulk export is parsed into products with variants, images and collections', async () => {
  const { catalog } = await load();
  const lines = [
    { id: 'gid://shopify/Product/1', title: 'X', handle: 'x', status: 'ACTIVE', tags: ['cat_a'], totalInventory: 2, mf_conditie: { value: '4* Zeer Goed' }, mf_colour: null, mf_refurb: { value: 'true' } },
    { id: 'gid://shopify/ProductVariant/11', sku: ' 123 ', __parentId: 'gid://shopify/Product/1' },
    { id: 'gid://shopify/MediaImage/5', image: { width: 800, height: 600 }, __parentId: 'gid://shopify/Product/1' },
    { id: 'gid://shopify/Collection/9', __parentId: 'gid://shopify/Product/1' },
  ].map(l => JSON.stringify(l)).join('\n');
  const [p] = plain(catalog.parseCatalog(lines));
  assert.match(catalog.CATALOG_BULK_QUERY, /mf_colour: metafield\(namespace: "custom", key: "color_swatch"\)/);
  assert.deepEqual(p.skus, ['123']);
  assert.equal(p.condition, '4* Zeer Goed');
  assert.equal(p.colour, null);
  assert.equal(p.refurbished, true);
  assert.deepEqual(p.images, [{ width: 800, height: 600 }]);
  assert.equal(p.collections, 1);
});

test('a healthy product is not reported', async () => {
  const { catalog } = await load();
  const r = plain(catalog.analyseCatalog([P(1)]));
  assert.equal(r.issues.length, 0);
  assert.equal(r.checked, 1);
});

test('photos, categories, properties and tags are checked', async () => {
  const { catalog } = await load();
  const r = plain(catalog.analyseCatalog([
    P(1, { images: [] }),
    P(2, { title: 'iPad 9 64GB 3*', images: [{ width: 600, height: 600 }, { width: 1500, height: 100 }], condition: '5* Als Nieuw' }),
    P(3, { title: 'Pixel 7 Zwart', tags: ['cat_', 'main_sku_999'], collections: 0, colour: null }),
  ]));
  const by = Object.fromEntries(r.issues.map(i => [i.productId.split('/').pop(), i]));
  assert.deepEqual(by[1].issues, ['no_photo']);
  assert.deepEqual(by[2].issues, ['low_photo', 'bad_photo', 'wrong_condition']);
  assert.deepEqual(by[2].fixes, [{ kind: 'condition', value: '3* Goed' }]);
  assert.deepEqual(by[3].issues, ['no_category', 'empty_category_tag', 'no_collection', 'no_colour', 'main_sku_mismatch']);
  assert.equal(r.counts.no_photo, 1);
});

test('a missing condition and a missing category get a safe fix proposal', async () => {
  const { catalog } = await load();
  const r = plain(catalog.analyseCatalog([
    P(1, { title: 'iPhone 13 128GB Blauw 4*', tags: ['cat_smartphones', 'cat_apple'], skus: ['205000000001'] }),
    P(2, { title: 'iPhone 13 128GB Zwart 5*', tags: ['cat_'], condition: null, skus: ['205000000002'] }),
  ]));
  const [i] = r.issues;
  assert.equal(i.productId, 'gid://shopify/Product/2');
  assert.deepEqual(i.fixes, [
    { kind: 'category', tags: ['cat_apple', 'cat_smartphones'], fromSku: '205000000001', removeEmptyTag: true },
    { kind: 'condition', value: '5* Als Nieuw' },
  ]);
});

test('duplicate titles are reported and products with stock come first', async () => {
  const { catalog } = await load();
  const r = plain(catalog.analyseCatalog([P(1, { totalInventory: 0, title: 'A 4*' }), P(2, { title: 'A 4*', totalInventory: 3 })]));
  assert.deepEqual(r.issues.map(i => i.productId.split('/').pop()), ['2', '1']);
  assert.ok(r.issues.every(i => i.issues.includes('duplicate_title')));
});

function fakeDb(report) {
  const writes = [];
  const from = table => {
    const q = { ops: [] };
    const result = () => {
      const ins = q.ops.find(o => o[0] === 'insert');
      if (ins) { writes.push({ table, rows: ins[1] }); return table === 'shopify_catalog_reports' ? { data: { id: 'R1' }, error: null } : { error: null }; }
      if (table === 'shopify_catalog_reports' && q.ops.some(o => o[0] === 'maybeSingle')) return { data: report, error: null };
      return { data: [], error: null };
    };
    const b = new Proxy({}, { get(_, k) { if (k === 'then') return (y, n) => Promise.resolve(result()).then(y, n); return (...a) => { q.ops.push([k, ...a]); return b; }; } });
    return b;
  };
  return { db: { from }, writes };
}
function fakeClient(products) {
  const calls = [];
  return { calls, client: { graphql: async (query, vars) => {
    const name = query.match(/(?:query|mutation) (\w+)/)[1];
    calls.push({ name, vars: plain(vars) });
    if (name === 'CatalogProduct') return { product: products[vars.id] ?? null };
    if (name === 'SyncMetafields') return { metafieldsSet: { userErrors: [] } };
    if (name === 'CatalogTagsAdd') return { tagsAdd: { userErrors: [] } };
    if (name === 'CatalogTagsRemove') return { tagsRemove: { userErrors: [] } };
    throw new Error('unexpected ' + name);
  } } };
}
const issue = (n, fixes, title = 'iPhone 13 128GB Zwart 5*') => ({ productId: `gid://shopify/Product/${n}`, title, handle: '', status: 'ACTIVE', skus: [], stock: 0, issues: [], fixes });

test('fixes are applied only when the product is unchanged and the problem still exists', async () => {
  const report = { issues: [
    issue(1, [{ kind: 'condition', value: '5* Als Nieuw' }]),
    issue(2, [{ kind: 'condition', value: '5* Als Nieuw' }]),
    issue(3, [{ kind: 'condition', value: '5* Als Nieuw' }]),
    issue(4, [{ kind: 'category', tags: ['cat_x'], fromSku: 'S', removeEmptyTag: true }]),
    issue(5, [{ kind: 'category', tags: ['cat_x'], fromSku: 'S', removeEmptyTag: false }]),
  ] };
  const { db, writes } = fakeDb(report);
  const { run } = await load(db);
  const t = 'iPhone 13 128GB Zwart 5*';
  const fake = fakeClient({
    'gid://shopify/Product/1': { id: 1, title: t, tags: [], condition: null },
    'gid://shopify/Product/2': { id: 2, title: t + ' (nieuw)', tags: [], condition: null },
    'gid://shopify/Product/3': { id: 3, title: t, tags: [], condition: { value: '5* Als Nieuw' } },
    'gid://shopify/Product/4': { id: 4, title: t, tags: ['cat_'], condition: null },
    'gid://shopify/Product/5': { id: 5, title: t, tags: ['cat_y'], condition: null },
  });
  const ids = [1, 2, 3, 4, 5, 6].map(n => `gid://shopify/Product/${n}`);
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: ids, kinds: ['condition', 'category'], actor: 'a' }, { db, client: fake.client }));
  assert.deepEqual(r, { applied: 2, skipped: 4, failed: 0 });
  const names = fake.calls.map(c => c.name).filter(n => n !== 'CatalogProduct');
  assert.deepEqual(names, ['SyncMetafields', 'CatalogTagsAdd', 'CatalogTagsRemove']);
  assert.equal(fake.calls.find(c => c.name === 'SyncMetafields').vars.metafields[0].value, '5* Als Nieuw');
  const log = plain(writes.filter(w => w.table === 'shopify_catalog_fixes').flatMap(w => w.rows));
  assert.deepEqual(log.map(l => l.result), ['ok', 'skipped', 'skipped', 'ok', 'skipped']);
});

test('a failed product read is logged as failed and earlier fixes stay logged', async () => {
  const fix = [{ kind: 'condition', value: '5* Als Nieuw' }];
  const { db, writes } = fakeDb({ issues: [issue(1, fix), issue(2, fix), issue(3, fix)] });
  const { run } = await load(db);
  const fake = fakeClient({ 'gid://shopify/Product/1': { id: 1, title: 'iPhone 13 128GB Zwart 5*', tags: [], condition: null }, 'gid://shopify/Product/3': { id: 3, title: 'iPhone 13 128GB Zwart 5*', tags: [], condition: null } });
  const original = fake.client.graphql;
  fake.client.graphql = async (q, v) => (v?.id === 'gid://shopify/Product/2' ? Promise.reject(new Error('netwerk')) : original(q, v));
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: [1, 2, 3].map(n => `gid://shopify/Product/${n}`), kinds: ['condition'], actor: 'a' }, { db, client: fake.client }));
  assert.deepEqual(r, { applied: 2, skipped: 0, failed: 1 });
  const log = plain(writes.filter(w => w.table === 'shopify_catalog_fixes').flatMap(w => w.rows));
  assert.deepEqual(log.map(l => l.result), ['ok', 'failed', 'ok']);
  assert.match(log[1].detail, /netwerk/);
});

test('only the chosen kinds are applied and the batch size is limited', async () => {
  const { db } = fakeDb({ issues: [issue(1, [{ kind: 'condition', value: '5* Als Nieuw' }])] });
  const { run } = await load(db);
  const fake = fakeClient({ 'gid://shopify/Product/1': { id: 1, title: 'iPhone 13 128GB Zwart 5*', tags: [], condition: null } });
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: ['gid://shopify/Product/1'], kinds: ['category'], actor: 'a' }, { db, client: fake.client }));
  assert.equal(r.applied, 0);
  assert.ok(!fake.calls.some(c => c.name === 'SyncMetafields'));
  await assert.rejects(run.applyCatalogFixes({ reportId: 'R1', productIds: Array.from({ length: 201 }, (_, i) => 'p' + i), kinds: ['condition'], actor: 'a' }, { db, client: fake.client }), /Maximaal 200/);
});

test('catalogue actions are admin-only and the SQL keeps the fix log append-only', () => {
  const actions = read('app/admin/erp/shopify/catalog/actions.ts');
  for (const body of actions.split('export async function').slice(1)) assert.match(body, /^\s*\w+\([^)]*\)\s*\{\s*const user = await requireAccess\('erp', 'write', true\)/);
  const sql = read('security/sql/shopify-catalog.sql');
  assert.match(sql, /grant select, insert on public\.shopify_catalog_fixes to service_role;/);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)[^;]*shopify_catalog_fixes/i);
  assert.match(sql, /enable row level security/);
});
