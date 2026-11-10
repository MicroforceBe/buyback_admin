import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as nodeCrypto from 'node:crypto';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(db = null) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout });
  const modules = new Map();
  const internal = { '@/lib/shopify/removal': 'lib/shopify/removal.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/cleanup': 'lib/shopify/cleanup.ts', '@/lib/shopify/redirects': 'lib/shopify/redirects.ts', '@/lib/shopify/redirectTarget': 'lib/shopify/redirectTarget.ts', '@/lib/marketing/merchantFeed': 'lib/marketing/merchantFeed.ts' };
  async function mod(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return mod(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { createHash: nodeCrypto.createHash }, '@/lib/supabaseAdmin': { supabaseAdmin: db } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return { removal: (await mod('lib/shopify/removal.ts')).namespace, target: (await mod('lib/shopify/redirectTarget.ts')).namespace, cleanup: db ? (await mod('lib/shopify/cleanup.ts')).namespace : null, redirects: db ? (await mod('lib/shopify/redirects.ts')).namespace : null };
}

const P = (n, over = {}) => ({ id: 'gid://shopify/Product/' + n, title: 'Product ' + n, handle: 'product-' + n, status: 'ACTIVE', positiveStock: 0, skus: ['OLD' + n], allVariantsChecked: true, collectionHandle: null, ...over });
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
  const args = { action: 'archive', requestedIds: [P(1).id], products: [P(1, { positiveStock: 3 })], erpSkus: new Set(), archivedAt: new Map(), now: NOW };
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
  const args = { action: 'delete', requestedIds: [P(1).id], products: [P(1, { status: 'ARCHIVED', positiveStock: 2 })], erpSkus: new Set(), archivedAt: new Map([[P(1).id, new Date('2026-11-01T00:00:00Z')]]), now: NOW };
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

function fakeDb({ erpCount = 600, log = [], failInsertAfter = Infinity } = {}) {
  let inserts = 0;
  const writes = [];
  const from = table => {
    const q = { ops: [] };
    const result = () => {
      const ins = q.ops.find(o => o[0] === 'insert');
      if (ins) { if (++inserts > failInsertAfter) return { error: { message: 'db' } }; writes.push({ table, rows: ins[1] }); return { error: null }; }
      if (table === 'erp_articles') {
        const range = q.ops.find(o => o[0] === 'range');
        const all = Array.from({ length: erpCount }, (_, i) => ({ sku: 'ERP' + i }));
        return { data: all.slice(range[1], range[2] + 1), error: null };
      }
      if (table === 'shopify_product_removals') { const range = q.ops.find(o => o[0] === 'range'); return { data: range ? log.slice(range[1], range[2] + 1) : log, error: null }; }
      return { data: null, error: null };
    };
    const b = new Proxy({}, { get(_, k) { if (k === 'then') return (y, n) => Promise.resolve(result()).then(y, n); return (...a) => { q.ops.push([k, ...a]); return b; }; } });
    return b;
  };
  return { db: { from }, writes };
}
function fakeClient(nodes, { scopes = [], redirects = [], siblings = [] } = {}) {
  const calls = [];
  let nextId = 1;
  return {
    calls,
    client: {
      graphql: async (query, vars, options) => {
        const name = query.match(/(?:query|mutation) (\w+)/)[1];
        calls.push([name, plain(vars ?? {}), options && plain(options)]);
        if (name === 'ProductInfo') return { product: nodes.find(n => n.id === vars.id) ?? null };
        if (name === 'AppScopes') return { currentAppInstallation: { accessScopes: scopes.map(handle => ({ handle })) } };
        if (name === 'SetProductStatus') return { productUpdate: { userErrors: [] } };
        if (name === 'DeleteProduct') return { productDelete: { deletedProductId: vars.id, userErrors: [] } };
        if (name === 'RedirectByPath') return { urlRedirects: { nodes: redirects.filter(r => vars.q === 'path:"' + r.path + '"') } };
        if (name === 'RedirectsByPaths') { const paths = [...vars.q.matchAll(/path:"([^"]+)"/g)].map(m => m[1]); return { urlRedirects: { nodes: redirects.filter(r => paths.includes(r.path)) } }; }
        if (name === 'RedirectsByTarget') return { urlRedirects: { nodes: redirects.filter(r => vars.q === 'target:"' + r.target + '"') } };
        if (name === 'RedirectCreate') { redirects.push({ id: 'r' + nextId++, path: vars.path, target: vars.target }); return { urlRedirectCreate: { userErrors: [] } }; }
        if (name === 'RedirectUpdate') { redirects.find(r => r.id === vars.id).target = vars.target; return { urlRedirectUpdate: { userErrors: [] } }; }
        if (name === 'RedirectDelete') { redirects.splice(redirects.findIndex(r => r.id === vars.id), 1); return { urlRedirectDelete: { deletedUrlRedirectId: vars.id, userErrors: [] } }; }
        if (name === 'Siblings') { const pages = Array.isArray(siblings[0]) ? siblings : [siblings]; const i = vars.after ? Number(vars.after) : 0; return { products: { pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: String(i + 1) }, nodes: pages[i] ?? [] } }; }
        throw new Error('unexpected ' + name);
      },
    },
  };
}
const levels = qs => ({ inventoryLevels: { pageInfo: { hasNextPage: false }, nodes: qs.map(q => ({ quantities: [{ quantity: q }] })) } });
const node = (n, over = {}) => ({ id: 'gid://shopify/Product/' + n, title: 'Product ' + n, handle: 'product-' + n, status: 'ACTIVE', variants: { nodes: [{ sku: 'OLD' + n, inventoryItem: levels([0, 0]) }], pageInfo: { hasNextPage: false } }, collections: { nodes: [{ handle: 'iphones' }] }, ...over });

test('archive re-checks Shopify and the ERP, writes ARCHIVED and logs every product', async () => {
  const { db, writes } = fakeDb();
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1), node(2, { variants: { nodes: [{ sku: 'ERP5', inventoryItem: levels([0]) }], pageInfo: { hasNextPage: false } } })]);
  const r = plain(await cleanup.runRemoval({ action: 'archive', ids: [node(1).id, node(2).id, 'not-a-gid'], includeStock: false, actor: 'admin@example.invalid' }, { db, client: fake.client }));
  assert.deepEqual(r, { action: 'archive', ok: 1, refused: 1, failed: 0, redirects: 0, redirectScope: false });
  assert.deepEqual(fake.calls.filter(c => c[0] === 'SetProductStatus').map(c => c[1].product), [{ id: node(1).id, status: 'ARCHIVED' }]);
  assert.deepEqual(plain(writes.flatMap(w => w.rows)).map(x => [x.product_id, x.result]).sort(), [[node(1).id, 'ok'], [node(2).id, 'refused']].sort());
});

test('a failing log write stops the run and explains how to recover', async () => {
  const { db } = fakeDb({ failInsertAfter: 0 });
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1), node(2)]);
  const r = plain(await cleanup.runRemoval({ action: 'archive', ids: [node(1).id, node(2).id], includeStock: false, actor: 'a' }, { db, client: fake.client }));
  assert.equal(fake.calls.filter(c => c[0] === 'SetProductStatus').length, 1);
  assert.match(r.logError, /Zet het terug als concept en archiveer opnieuw/);
  assert.match(read('app/admin/erp/shopify/actions.ts'), /if \(result\.logError\) redirect\(target\(\{ error:/);
});

test('the latest archive per product is found beyond the first 1000 log rows', async () => {
  const noise = Array.from({ length: 1200 }, (_, i) => ({ product_id: node(2).id, action: i % 2 ? 'archive' : 'restore', created_at: '2026-12-01T00:00:00Z' }));
  const { db } = fakeDb({ log: [...noise, { product_id: node(1).id, action: 'archive', created_at: '2026-10-01T00:00:00Z' }] });
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1, { status: 'ARCHIVED' })]);
  const r = plain(await cleanup.runRemoval({ action: 'delete', ids: [node(1).id, node(2).id], includeStock: false, actor: 'a' }, { db, client: fake.client, now: () => NOW }));
  assert.equal(r.ok, 1);
});

test('positive stock on one location is not hidden by negative stock elsewhere', async () => {
  const { db } = fakeDb();
  const { cleanup } = await load(db);
  const fake = fakeClient([node(1, { variants: { nodes: [{ sku: 'OLD1', inventoryItem: levels([3, -3]) }], pageInfo: { hasNextPage: false } } })]);
  const r = plain(await cleanup.runRemoval({ action: 'archive', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client }));
  assert.equal(r.ok, 0);
  assert.equal(r.refused, 1);
  assert.equal(fake.calls.filter(c => c[0] === 'SetProductStatus').length, 0);
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
    const redirect = fake.calls.find(c => c[0] === 'RedirectCreate');
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

test('the redirect goes to the same model in stock, else the collection, never a generic one', async () => {
  const { target } = await load();
  const p = { handle: 'iphone-13-128gb-midnight-4', title: 'iPhone 13 128GB Midnight Refurbished 4* M', collectionHandle: 'iphone' };
  const c = (handle, title, stock, status = 'ACTIVE', online = true) => ({ handle, title, stock, status, online });
  assert.equal(target.chooseRedirectTarget(p, [c('iphone-13-128gb-blue-5', 'iPhone 13 128GB Blue Refurbished 5*', 3), c('iphone-13-128gb-midnight-5', 'iPhone 13 128GB Midnight Refurbished 5* M', 1)]), '/products/iphone-13-128gb-midnight-5');
  assert.equal(target.chooseRedirectTarget(p, [c('iphone-13-128gb-midnight-5', 'iPhone 13 128GB Midnight Refurbished 5*', 0)]), '/collections/iphone');
  assert.equal(target.chooseRedirectTarget(p, [c('iphone-13-128gb-midnight-5', 'iPhone 13 128GB Midnight Refurbished 5*', 2, 'DRAFT')]), '/collections/iphone');
  assert.equal(target.chooseRedirectTarget(p, [c('iphone-13-128gb-midnight-5', 'iPhone 13 128GB Midnight Refurbished 5*', 2, 'ACTIVE', false)]), '/collections/iphone');
  assert.equal(target.chooseRedirectTarget({ ...p, collectionHandle: 'frontpage' }, []), '/collections/all');
  assert.equal(target.chooseRedirectTarget({ ...p, collectionHandle: null }, [c(p.handle, p.title, 5)]), '/collections/all');
  assert.match(target.siblingQuery(p.title), /^status:active inventory_total:>0 title:"iphone" title:"13" title:"128gb" title:"midnight"$/);
  assert.equal(target.siblingQuery('iPhone 15 Pro Max 256GB Naturel Titanium Refurbished 4*'), 'status:active inventory_total:>0 title:"iphone" title:"15" title:"pro" title:"max" title:"256gb" title:"titanium"');
  assert.equal(target.siblingQuery('iPad Pro 11" 2022 256GB Wifi SpaceGrey Refurbished 5* M'), 'status:active inventory_total:>0 title:"ipad" title:"pro" title:"11" title:"2022" title:"256gb" title:"wifi"');
});

test('archiving makes the 301 right away and re-points redirects that pointed to the archived page', async () => {
  const { db, writes } = fakeDb();
  const { cleanup } = await load(db);
  const redirects = [{ id: 'old', path: '/products/older-one', target: '/products/product-1' }];
  const fake = fakeClient([node(1)], { scopes: ['write_online_store_navigation'], redirects, siblings: [{ handle: 'product-1-b', title: 'Product 1 Refurbished 5*', status: 'ACTIVE', totalInventory: 2, onlineStoreUrl: 'https://shop/products/product-1-b' }, { handle: 'product-1-c', title: 'Product 1 Refurbished 4*', status: 'ACTIVE', totalInventory: 9, onlineStoreUrl: null }] });
  const r = plain(await cleanup.runRemoval({ action: 'archive', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client }));
  assert.equal(r.ok, 1);
  assert.equal(r.redirects, 1);
  assert.deepEqual(plain(redirects).map(x => [x.path, x.target]).sort(), [['/products/older-one', '/products/product-1-b'], ['/products/product-1', '/products/product-1-b']]);
  assert.equal(plain(writes[0].rows)[0].redirect, '/products/product-1 → /products/product-1-b');
});

test('restoring removes the redirect so the page is reachable again; without the scope nothing is touched', async () => {
  for (const scopes of [['write_online_store_navigation'], []]) {
    const { db } = fakeDb();
    const { cleanup } = await load(db);
    const redirects = [{ id: 'r9', path: '/products/product-1', target: '/collections/iphones' }];
    const fake = fakeClient([node(1, { status: 'ARCHIVED' })], { scopes, redirects });
    const r = plain(await cleanup.runRemoval({ action: 'restore', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client }));
    assert.equal(r.ok, 1);
    assert.equal(redirects.length, scopes.length ? 0 : 1);
  }
});

test('an existing redirect for the path is updated, never duplicated', async () => {
  const log = [{ product_id: node(1).id, action: 'archive', created_at: '2026-10-01T00:00:00Z' }];
  const { db } = fakeDb({ log });
  const { cleanup } = await load(db);
  const redirects = [{ id: 'r1', path: '/products/product-1', target: '/collections/iphones' }];
  const fake = fakeClient([node(1, { status: 'ARCHIVED' })], { scopes: ['write_online_store_navigation'], redirects });
  await cleanup.runRemoval({ action: 'delete', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client, now: () => NOW });
  assert.equal(redirects.length, 1);
  assert.equal(fake.calls.filter(c => c[0] === 'RedirectCreate').length, 0);
});

test('the catch-up resumes where the previous click stopped, so the whole backlog gets done', async () => {
  const { db } = fakeDb();
  const { redirects: mod } = await load(db);
  const archived = Array.from({ length: 5 }, (_, i) => ({ id: 'gid://shopify/Product/' + i, title: 'Oud ' + i, handle: 'oud-' + i, collections: { nodes: [] } }));
  const fake = fakeClient([], { scopes: ['write_online_store_navigation'] });
  const base = fake.client.graphql;
  fake.client.graphql = async (q, v, o) => {
    if (q.includes('BacklogProducts')) { const start = v.after ? Number(v.after) : 0; return { products: { pageInfo: { hasNextPage: start + 2 < archived.length, endCursor: String(start + 2) }, nodes: archived.slice(start, start + 2) } }; }
    return base(q, v, o);
  };
  const first = plain(await mod.redirectBacklog(fake.client, { max: 3 }));
  assert.deepEqual([first.created, first.remaining, first.cursor], [3, true, '2']);
  const second = plain(await mod.redirectBacklog(fake.client, { max: 3, after: first.cursor }));
  assert.deepEqual([second.created, second.existing, second.remaining], [2, 1, false]);
  assert.match(read('app/admin/erp/shopify/page.tsx'), /name="after" value=\{params\.after\}/);
});

test('the catch-up covers drafts and replaces homepage redirects, but leaves good ones alone', async () => {
  const { db } = fakeDb();
  const { redirects: mod } = await load(db);
  const products = ['geen', 'home', 'home-fr', 'goed'].map((h, i) => ({ id: 'gid://shopify/Product/' + i, title: 'Oud ' + h, handle: h, collections: { nodes: [{ handle: 'refurbished-iphone-13' }] } }));
  const redirects = [
    { id: 'a', path: '/products/home', target: 'https://www.microforce.be/' },
    { id: 'b', path: '/products/home-fr', target: '/fr' },
    { id: 'c', path: '/products/goed', target: '/collections/refurbished-iphone-12' },
  ];
  const fake = fakeClient([], { scopes: ['write_online_store_navigation'], redirects });
  const base = fake.client.graphql;
  let query = '';
  fake.client.graphql = async (q, v, o) => {
    if (q.includes('BacklogProducts')) { query = q; return { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: products } }; }
    return base(q, v, o);
  };
  const dry = plain(await mod.redirectBacklog(fake.client, { dryRun: true }));
  assert.deepEqual([dry.created, dry.replaced, dry.existing], [1, 2, 1]);
  assert.equal(redirects.length, 3);
  const r = plain(await mod.redirectBacklog(fake.client));
  assert.deepEqual([r.created, r.replaced, r.existing, r.failed], [1, 2, 1, 0]);
  assert.match(query, /status:archived OR status:draft/);
  assert.deepEqual(plain(redirects).map(x => [x.path, x.target]).sort(), [
    ['/products/geen', '/collections/refurbished-iphone-13'],
    ['/products/goed', '/collections/refurbished-iphone-12'],
    ['/products/home', '/collections/refurbished-iphone-13'],
    ['/products/home-fr', '/collections/refurbished-iphone-13'],
  ]);
  const again = plain(await mod.redirectBacklog(fake.client));
  assert.deepEqual([again.created, again.replaced, again.existing], [0, 0, 4]);
  assert.equal(fake.calls.filter(c => c[0] === 'RedirectsByPaths').length, 3);
});

test('only a bare homepage counts as a weak redirect target', async () => {
  const { target } = await load();
  for (const t of ['/', '', 'https://www.microforce.be/', 'https://microforce.be', 'http://www.microforce.be/?ref=x', '/fr', '/en/', '/nl']) assert.equal(target.isWeakRedirectTarget(t), true, t);
  for (const t of ['/collections/all', '/products/x', '/fr/collections/iphone', 'https://www.microforce.be/pages/faq', 'https://microforce.be.evil.example/', '/france']) assert.equal(target.isWeakRedirectTarget(t), false, t);
});

test('the hourly redirect catch-up follows the sync switch and is protected by the cron secret', () => {
  const run = read('lib/shopify/redirectsRun.ts');
  assert.match(run, /settings\.mode === 'off'\) return \{ status: 'skipped'/);
  assert.match(run, /dryRun: settings\.mode !== 'live'/);
  assert.match(read('app/api/shopify-redirects/route.ts'), /bearerMatches\(request\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/);
  assert.ok(JSON.parse(read('vercel.json')).crons.some(c => c.path === '/api/shopify-redirects'));
});

test('the sibling search reads further pages until an eligible sibling turns up', async () => {
  const { db } = fakeDb();
  const { cleanup } = await load(db);
  const other = i => ({ handle: 'x-' + i, title: 'Iets anders ' + i, status: 'ACTIVE', totalInventory: 5, onlineStoreUrl: 'https://shop/x' });
  const pages = [Array.from({ length: 50 }, (_, i) => other(i)), [{ handle: 'product-1-b', title: 'Product 1 Refurbished 5*', status: 'ACTIVE', totalInventory: 1, onlineStoreUrl: 'https://shop/p' }], [other(99)]];
  const redirects = [];
  const fake = fakeClient([node(1)], { scopes: ['write_online_store_navigation'], redirects, siblings: pages });
  await cleanup.runRemoval({ action: 'archive', ids: [node(1).id], includeStock: false, actor: 'a' }, { db, client: fake.client });
  assert.equal(plain(redirects)[0].target, '/products/product-1-b');
  assert.equal(fake.calls.filter(c => c[0] === 'Siblings').length, 2);
});
