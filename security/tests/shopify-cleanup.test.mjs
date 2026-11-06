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
  const internal = { '@/lib/shopify/removal': 'lib/shopify/removal.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/cleanup': 'lib/shopify/cleanup.ts' };
  async function mod(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return mod(internal[spec]);
      const e = { 'server-only': {}, '@/lib/supabaseAdmin': { supabaseAdmin: db } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return { removal: (await mod('lib/shopify/removal.ts')).namespace, cleanup: db ? (await mod('lib/shopify/cleanup.ts')).namespace : null };
}

const P = (n, over = {}) => ({ id: 'gid://shopify/Product/' + n, title: 'Product ' + n, handle: 'product-' + n, status: 'ACTIVE', totalInventory: 0, skus: ['OLD' + n], allVariantsChecked: true, collectionHandle: null, ...over });
const NOW = new Date('2026-12-31T12:00:00Z');

test('a product is never archived or deleted while one of its SKUs is still in the ERP', async () => {
  const { removal } = await load();
  const r = plain(removal.checkRemoval({ action: 'archive', requestedIds: [P(1).id, P(2).id], products: [P(1, { skus: ['OLD1', 'LIVE'] }), P(2)], erpSkus: new Set(['LIVE']), includeStock: false, archivedAt: new Map(), now: NOW }));
  assert.deepEqual(r.ok.map(p => p.id), [P(2).id]);
  assert.match(r.refused[0].reason, /LIVE staat nog in het ERP/);
});

test('a product with unchecked variants (more than one page) is never touched', async () => {
  const { removal } = await load();
  const r = removal.checkRemoval({ action: 'archive', requestedIds: [P(1).id], products: [P(1, { allVariantsChecked: false })], erpSkus: new Set(), includeStock: false, archivedAt: new Map(), now: NOW });
  assert.equal(r.ok.length, 0);
  assert.match(r.refused[0].reason, /te veel varianten/);
});

test('a deletion stays recorded as successful when the redirect request throws', async () => {
  const { db, writes } = fakeDb({ log: [{ product_id: node(1).id, action: 'archive', created_at: '2026-10-01T00:00:00Z' }] });
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1, { status: 'ARCHIVED' })], { scopes: ['write_online_store_navigation'] });
  const original = fake.client.graphql;
  fake.client.graphql = async (q, v, o) => (q.includes('urlRedirectCreate') ? Promise.reject(new Error('netwerk')) : original(q, v, o));
  const r = plain(await cleanup.runRemoval({ action: 'delete', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client, now: () => NOW }));
  assert.equal(r.ok, 1);
  assert.equal(r.failed, 0);
  const row = plain(writes[0].rows)[0];
  assert.equal(row.result, 'ok');
  assert.match(row.detail, /doorverwijzing mislukt: netwerk/);
});

test('stock blocks archiving unless explicitly included', async () => {
  const { removal } = await load();
  const args = { action: 'archive', requestedIds: [P(1).id], products: [P(1, { totalInventory: 3 })], erpSkus: new Set(), archivedAt: new Map(), now: NOW };
  assert.equal(removal.checkRemoval({ ...args, includeStock: false }).ok.length, 0);
  assert.equal(removal.checkRemoval({ ...args, includeStock: true }).ok.length, 1);
});

test('delete requires archive by this tool at least 30 days ago', async () => {
  const { removal } = await load();
  const base = { action: 'delete', requestedIds: [P(1).id], erpSkus: new Set(), includeStock: false, now: NOW };
  const archived = P(1, { status: 'ARCHIVED' });
  assert.match(removal.checkRemoval({ ...base, products: [P(1)], archivedAt: new Map() }).refused[0].reason, /eerst archiveren/);
  assert.match(removal.checkRemoval({ ...base, products: [archived], archivedAt: new Map() }).refused[0].reason, /niet via deze tool/);
  assert.match(removal.checkRemoval({ ...base, products: [archived], archivedAt: new Map([[P(1).id, new Date('2026-12-20T12:00:00Z')]]) }).refused[0].reason, /na 30 dagen/);
  assert.equal(removal.checkRemoval({ ...base, products: [archived], archivedAt: new Map([[P(1).id, new Date('2026-11-30T12:00:00Z')]]) }).ok.length, 1);
});

test('current stock also blocks deletion unless explicitly allowed', async () => {
  const { removal } = await load();
  const args = { action: 'delete', requestedIds: [P(1).id], products: [P(1, { status: 'ARCHIVED', totalInventory: 2 })], erpSkus: new Set(), archivedAt: new Map([[P(1).id, new Date('2026-11-01T00:00:00Z')]]), now: NOW };
  assert.match(removal.checkRemoval({ ...args, includeStock: false }).refused[0].reason, /voorraad \(2\)/);
  assert.equal(removal.checkRemoval({ ...args, includeStock: true }).ok.length, 1);
});

test('more than 100 products at once are all refused', async () => {
  const { removal } = await load();
  const ids = Array.from({ length: 101 }, (_, i) => P(i).id);
  const r = removal.checkRemoval({ action: 'archive', requestedIds: ids, products: ids.map((_, i) => P(i)), erpSkus: new Set(), includeStock: false, archivedAt: new Map(), now: NOW });
  assert.equal(r.ok.length, 0);
  assert.equal(r.refused.length, 101);
});

function fakeDb({ erpCount = 600, log = [] } = {}) {
  const writes = [];
  const from = table => {
    const q = { ops: [] };
    const result = () => {
      const ins = q.ops.find(o => o[0] === 'insert');
      if (ins) { writes.push({ table, rows: ins[1] }); return { error: null }; }
      if (table === 'erp_articles') {
        const range = q.ops.find(o => o[0] === 'range');
        const all = Array.from({ length: erpCount }, (_, i) => ({ sku: 'ERP' + i }));
        return { data: all.slice(range[1], range[2] + 1), error: null };
      }
      if (table === 'shopify_product_removals') return { data: log, error: null };
      return { data: null, error: null };
    };
    const b = new Proxy({}, { get(_, k) { if (k === 'then') return (y, n) => Promise.resolve(result()).then(y, n); return (...a) => { q.ops.push([k, ...a]); return b; }; } });
    return b;
  };
  return { db: { from }, writes };
}
function fakeClient(nodes, { scopes = [] } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      graphql: async (query, vars, options) => {
        const name = query.match(/(?:query|mutation) (\w+)/)[1];
        calls.push([name, plain(vars ?? {}), options && plain(options)]);
        if (name === 'ProductsInfo') return { nodes };
        if (name === 'AppScopes') return { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) } };
        if (name === 'SetProductStatus') return { productUpdate: { userErrors: [] } };
        if (name === 'DeleteProduct') return { productDelete: { deletedProductId: vars.id, userErrors: [] } };
        if (name === 'CreateRedirect') return { urlRedirectCreate: { userErrors: [] } };
        throw new Error('unexpected ' + name);
      },
    },
  };
}
const node = (n, over = {}) => ({ id: 'gid://shopify/Product/' + n, title: 'Product ' + n, handle: 'product-' + n, status: 'ACTIVE', totalInventory: 0, variants: { nodes: [{ sku: 'OLD' + n }], pageInfo: { hasNextPage: false } }, collections: { nodes: [{ handle: 'iphones' }] }, ...over });

test('archive re-checks Shopify and the ERP, writes ARCHIVED and logs every product', async () => {
  const { db, writes } = fakeDb();
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1), node(2, { variants: { nodes: [{ sku: 'ERP5' }], pageInfo: { hasNextPage: false } } })]);
  const r = plain(await cleanup.runRemoval({ action: 'archive', ids: [node(1).id, node(2).id, 'not-a-gid'], includeStock: false, actor: 'admin@example.invalid' }, { db, client: fake.client }));
  assert.deepEqual(r, { action: 'archive', ok: 1, refused: 1, failed: 0, redirects: 0, redirectScope: false });
  assert.deepEqual(fake.calls.filter(c => c[0] === 'SetProductStatus').map(c => c[1].product), [{ id: node(1).id, status: 'ARCHIVED' }]);
  assert.deepEqual(plain(writes[0].rows).map(x => [x.product_id, x.result]).sort(), [[node(1).id, 'ok'], [node(2).id, 'refused']].sort());
});

test('nothing happens when the ERP data looks incomplete', async () => {
  const { db } = fakeDb({ erpCount: 10 });
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1)]);
  await assert.rejects(cleanup.runRemoval({ action: 'archive', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client }), /onvolledig/);
  assert.equal(fake.calls.length, 0);
});

test('delete without retries, with a redirect only when the scope is granted', async () => {
  const log = [{ product_id: node(1).id, action: 'archive', created_at: '2026-10-01T00:00:00Z' }];
  for (const scopes of [[], ['write_online_store_navigation']]) {
    const { db, writes } = fakeDb({ log });
    const { cleanup } = await load(db);
    const fake = fakeClient([node(1, { status: 'ARCHIVED' })], { scopes });
    const r = plain(await cleanup.runRemoval({ action: 'delete', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client, now: () => NOW }));
    assert.equal(r.ok, 1);
    const del = fake.calls.find(c => c[0] === 'DeleteProduct');
    assert.deepEqual(del[2], { retryServerErrors: false });
    const redirect = fake.calls.find(c => c[0] === 'CreateRedirect');
    if (scopes.length) {
      assert.deepEqual(redirect[1], { path: '/products/product-1', target: '/collections/iphones' });
      assert.equal(plain(writes[0].rows)[0].redirect, '/products/product-1 → /collections/iphones');
    } else {
      assert.equal(redirect, undefined);
      assert.match(plain(writes[0].rows)[0].detail, /recht write_online_store_navigation ontbreekt/);
    }
  }
});

test('admin-only server action with confirmation; delete needs the typed word', () => {
  const actions = read('app/admin/erp/shopify/actions.ts');
  assert.match(actions, /export async function removalAction\(formData: FormData\) \{\n  const user = await requireAccess\('erp', 'write', true\);/);
  assert.match(actions, /formData\.get\('confirm'\) !== 'on'/);
  assert.match(actions, /confirm_text'\) \?\? ''\)\.trim\(\) !== 'VERWIJDER'/);
});

test('the archived list reads the complete history of successful actions, not the short log', () => {
  const page = read('app/admin/erp/shopify/page.tsx');
  assert.match(page, /\.eq\('result', 'ok'\)\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)\.range\(from, from \+ 999\)/);
});

test('the removal log is append-only for the application', () => {
  const sql = read('security/sql/shopify-product-removals.sql');
  assert.match(sql, /grant select, insert on public\.shopify_product_removals to service_role;/);
  assert.doesNotMatch(sql, /grant[^;]*(update|delete)[^;]*shopify_product_removals/i);
});
