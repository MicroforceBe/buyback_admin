import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(db = null) {
  const context = vm.createContext({ TextEncoder, console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, setTimeout });
  const modules = new Map();
  const internal = { '@/lib/shopify/enrich': 'lib/shopify/enrich.ts', '@/lib/shopify/seo': 'lib/shopify/seo.ts', '@/lib/shopify/textClean': 'lib/shopify/textClean.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/collections': 'lib/shopify/collections.ts', '@/lib/shopify/collectionsRun': 'lib/shopify/collectionsRun.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { randomUUID: () => 'tok1-abcdefghij' }, '@/lib/supabaseAdmin': { supabaseAdmin: db } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return { col: (await ld('lib/shopify/collections.ts')).namespace, run: (await ld('lib/shopify/collectionsRun.ts')).namespace };
}

const C = (n, over = {}) => ({ id: `gid://shopify/Collection/${n}`, title: `Coll ${n}`, handle: `coll-${n}`, seoTitle: 'T', seoDescription: 'D', hidden: false,
  descriptionWords: 300, descriptionH1Count: 0, descriptionScripts: 0, descriptionNames: 0, descriptionPlaceholder: false, descriptionCssText: false, products: 3, active: 3, inStock: 2, refurbished: 3, activeSet: `set${n}`, ...over });

test('the bulk export is parsed with product counts, stock, refurbished share and hidden flag', async () => {
  const { col } = await load();
  const lines = [
    { id: 'gid://shopify/Collection/1', title: 'iPad 2019', handle: 'microforce-ipad-ipad-2019', seo: { title: null, description: '' }, descriptionHtml: '<h1>x</h1><p>een twee</p>', hidden: { value: '1' } },
    { id: 'gid://shopify/Product/10', status: 'ACTIVE', totalInventory: 2, rf: { value: 'true' }, __parentId: 'gid://shopify/Collection/1' },
    { id: 'gid://shopify/Product/11', status: 'ACTIVE', totalInventory: 0, rf: { value: 'false' }, __parentId: 'gid://shopify/Collection/1' },
    { id: 'gid://shopify/Product/12', status: 'DRAFT', totalInventory: 5, rf: { value: 'true' }, __parentId: 'gid://shopify/Collection/1' },
  ].map(l => JSON.stringify(l)).join('\n');
  const [c] = plain(col.parseCollections(lines));
  assert.equal(c.products, 3);
  assert.equal(c.active, 2);
  assert.equal(c.inStock, 1);
  assert.equal(c.refurbished, 1);
  assert.equal(c.hidden, true);
  assert.equal(c.descriptionH1Count, 1);
  assert.ok(c.activeSet);
});

test('internal collections are recognised; names get the device word from the handle', async () => {
  const { col } = await load();
  for (const [t, h] of [['CS-ATB-iPhone 12', 'cs-atb-iphone-12'], ['CSQ-ATB MacBook Pro/Air 15"', 'csq-atb-macbook-pro-air-15'], ['CS_ATB-iPhone 12 Pro Max', 'cs_atb-iphone-12-pro-max'], ['Best selling', 'best-selling'], ['Best Seller', 'best-seller'], ['Homepage', 'frontpage']])
    assert.equal(col.isInternalCollection(t, h), true, t);
  assert.equal(col.isInternalCollection('iPad 2019', 'microforce-ipad-ipad-2019'), false);
  assert.equal(col.collectionName('11 Pro Max', 'refurbished-iphone-11-pro-max'), 'iPhone 11 Pro Max');
  assert.equal(col.collectionName('iPad 2019', 'microforce-ipad-ipad-2019'), 'iPad 2019');
  assert.equal(col.collectionName('Refurbished iMac 24"', 'refurbished-imac-24'), 'iMac 24"');
  const t = col.suggestCollectionSeoTitle('iPad 2019', true);
  assert.equal(t, 'Refurbished iPad 2019 kopen – met garantie | Microforce');
  assert.ok(col.suggestCollectionSeoDescription('iPhone 14 Pro Max', true).length <= 155);
  assert.doesNotMatch(col.suggestCollectionSeoDescription('iPhone 14 Pro Max', true), /€|\d+ toestellen/);
  assert.equal(col.suggestCollectionSeoTitle('Hoesjes iPhone 13', false), 'Hoesjes iPhone 13 kopen | Microforce');
});

test('checks and proposals: SEO, text, H1, empty, internal (hide only) and duplicates', async () => {
  const { col } = await load();
  const r = plain(col.analyseCollections([
    C(1, { title: 'iPad 2019', handle: 'microforce-ipad-ipad-2019', seoTitle: '', seoDescription: '', descriptionWords: 0, activeSet: 'same', inStock: 9 }),
    C(2, { title: 'iMac', handle: 'microforce-reparaties-imac', activeSet: 'same', descriptionWords: 0 }),
    C(3, { title: 'CS-ATB-iPhone 12', handle: 'cs-atb-iphone-12', seoTitle: '', descriptionWords: 0 }),
    C(4, { title: 'Galaxy S10', handle: 'microforce-samsung-galaxy-s10', active: 0, inStock: 0, refurbished: 0, activeSet: null, descriptionH1Count: 2 }),
    C(5, { title: 'CS-ATB iPad Mini 6', handle: 'cs-atb-ipad-mini-6', hidden: true }),
    C(6),
  ]));
  const by = Object.fromEntries(r.issues.map(i => [i.collectionId.split('/').pop(), i]));
  assert.deepEqual(by[1].issues, ['col_seo_title_missing', 'col_seo_description_missing', 'col_description_empty']);
  assert.deepEqual(by[1].fixes, [{ kind: 'col_seo', title: 'Refurbished iPad 2019 kopen – met garantie | Microforce', description: by[1].fixes[0].description }]);
  assert.ok(by[2].issues.includes('col_duplicate'));
  assert.equal(by[2].duplicateOf, 'iPad 2019');
  assert.ok(!by[1].issues.includes('col_duplicate'));
  assert.deepEqual(by[3].issues, ['col_internal']);
  assert.deepEqual(by[3].fixes, [{ kind: 'col_hide' }]);
  assert.deepEqual(by[4].issues, ['col_h1', 'col_empty']);
  assert.deepEqual(by[4].fixes, [{ kind: 'col_heading', count: 2 }]);
  assert.equal(by[5], undefined, 'hidden internal collection is fine');
  assert.equal(by[6], undefined);
  assert.equal(r.issues[0].collectionId, 'gid://shopify/Collection/1', 'stock first');
});

function fakeDb(report, { fix = null, reverted = false } = {}) {
  const writes = [];
  const from = table => {
    const q = { ops: [] };
    const result = () => {
      const ins = q.ops.find(o => o[0] === 'insert');
      if (ins) { writes.push({ table, rows: ins[1] }); return { data: { id: 'R1' }, error: null }; }
      if (table === 'shopify_catalog_reports' && q.ops.some(o => o[0] === 'maybeSingle')) return { data: report, error: null };
      if (table === 'shopify_catalog_fixes' && q.ops.some(o => o[0] === 'maybeSingle')) return { data: fix, error: null };
      if (table === 'shopify_catalog_fixes' && q.ops.some(o => o[0] === 'eq' && o[1] === 'reverts')) return { data: reverted ? [{ id: 99 }] : [], error: null };
      return { data: [], error: null };
    };
    const b = new Proxy({}, { get(_, k) { if (k === 'then') return (y, n) => Promise.resolve(result()).then(y, n); return (...a) => { q.ops.push([k, ...a]); return b; }; } });
    return b;
  };
  return { db: { from }, writes };
}
function fakeClient(state) {
  const calls = [];
  return { calls, client: { graphql: async (query, vars) => {
    const name = query.match(/(?:query|mutation) (\w+)/)[1];
    calls.push({ name, vars: plain(vars) });
    if (name === 'CollectionInfo') return { collection: state[vars.id] ?? null };
    if (name === 'CollectionSeoUpdate') { const c = state[vars.collection.id]; if (vars.collection.seo) c.seo = { ...vars.collection.seo }; if ('descriptionHtml' in vars.collection) c.descriptionHtml = vars.collection.descriptionHtml; return { collectionUpdate: { userErrors: [] } }; }
    if (name === 'SyncMetafields') { state[vars.metafields[0].ownerId].hidden = { value: vars.metafields[0].value }; return { metafieldsSet: { userErrors: [] } }; }
    if (name === 'CollectionMetafieldsDelete') { state[vars.metafields[0].ownerId].hidden = null; return { metafieldsDelete: { userErrors: [] } }; }
    throw new Error('unexpected ' + name);
  } } };
}
const issue = (n, fixes, title = `Coll ${n}`) => ({ collectionId: `gid://shopify/Collection/${n}`, title, handle: '', active: 1, inStock: 1, hidden: false, issues: [], fixes });

test('collection fixes: only empty SEO fields, hide internal ones, demote H1; each re-checked and logged', async () => {
  const state = {
    'gid://shopify/Collection/1': { id: 1, title: 'Coll 1', descriptionHtml: '', seo: { title: 'Eigen titel', description: null }, hidden: null },
    'gid://shopify/Collection/2': { id: 2, title: 'Coll 2', descriptionHtml: '', seo: null, hidden: null },
    'gid://shopify/Collection/3': { id: 3, title: 'Coll 3', descriptionHtml: '<h1>Kop</h1><p>t</p>', seo: null, hidden: null },
    'gid://shopify/Collection/4': { id: 4, title: 'Gewijzigd', descriptionHtml: '', seo: null, hidden: null },
  };
  const { db, writes } = fakeDb({ issues: [
    issue(1, [{ kind: 'col_seo', title: 'Nieuw', description: 'Nieuwe meta' }]),
    issue(2, [{ kind: 'col_hide' }]),
    issue(3, [{ kind: 'col_heading', count: 1 }]),
    issue(4, [{ kind: 'col_hide' }]),
  ] });
  const { run } = await load(db);
  const fake = fakeClient(state);
  const r = plain(await run.applyCollectionFixes({ reportId: 'R1', collectionIds: [1, 2, 3, 4, 5].map(n => `gid://shopify/Collection/${n}`), kinds: ['col_seo', 'col_hide', 'col_heading'], actor: 'a' }, { db, client: fake.client }));
  assert.deepEqual(r, { applied: 3, skipped: 1, failed: 0, noMatch: 1 });
  assert.deepEqual(state['gid://shopify/Collection/1'].seo, { title: 'Eigen titel', description: 'Nieuwe meta' });
  assert.deepEqual(state['gid://shopify/Collection/2'].hidden, { value: '1' });
  assert.match(state['gid://shopify/Collection/3'].descriptionHtml, /^<h2 data-mf-h1="tok1-abcdefg">Kop<\/h2>/);
  const log = plain(writes.flatMap(w => w.rows));
  assert.deepEqual(log.map(l => [l.kind, l.result]), [['col_seo', 'ok'], ['col_hide', 'ok'], ['col_heading', 'ok'], ['col_hide', 'skipped']]);
});

test('collection fixes can be undone once, only when unchanged since', async () => {
  const state = { 'gid://shopify/Collection/1': { id: 1, title: 'C', descriptionHtml: '<h2 data-mf-h1="tok1-abcdefg">Kop</h2>', seo: { title: 'Nieuw', description: 'M' }, hidden: { value: '1' } } };
  const row = (kind, old_value, new_value) => ({ id: 7, report_id: 'R1', product_id: 'gid://shopify/Collection/1', title: 'C', kind, result: 'ok', old_value, new_value });
  for (const [kind, old_value, new_value, check] of [
    ['col_seo', { title: null, description: null }, { title: 'Nieuw', description: 'M' }, s => assert.deepEqual(s.seo, { title: '', description: '' })],
    ['col_hide', { hidden: false }, { hidden: true }, s => assert.equal(s.hidden, null)],
    ['col_heading', { headings: 1, token: 'tok1-abcdefg' }, { headings: 1, token: 'tok1-abcdefg' }, s => assert.equal(s.descriptionHtml, '<h1>Kop</h1>')],
  ]) {
    const { db, writes } = fakeDb(null, { fix: row(kind, old_value, new_value) });
    const { run } = await load(db);
    const u = plain(await run.revertCollectionFix({ fixId: 7, actor: 'a' }, { db, client: fakeClient(state).client }));
    assert.equal(u.ok, true, kind);
    check(state['gid://shopify/Collection/1']);
    assert.equal(plain(writes[0].rows).reverts, 7);
  }
  const { db } = fakeDb(null, { fix: row('col_hide', { hidden: false }, { hidden: true }), reverted: true });
  const { run } = await load(db);
  await assert.rejects(run.revertCollectionFix({ fixId: 7, actor: 'a' }, { db, client: fakeClient(state).client }), /al teruggedraaid/);
});

test('collection actions are admin-only and reports are kept apart from product reports', () => {
  const actions = read('app/admin/erp/shopify/collections/actions.ts');
  for (const body of actions.split('export async function').slice(1)) assert.match(body, /^\s*\w+\([^)]*\)\s*\{\s*const user = await requireAccess\('erp', 'write', true\)/);
  for (const f of ['lib/shopify/collectionsRun.ts', 'app/admin/erp/shopify/collections/page.tsx']) assert.match(read(f), /eq\('scope', 'collections'\)/);
  for (const f of ['lib/shopify/catalogRun.ts', 'app/admin/erp/shopify/catalog/page.tsx']) assert.match(read(f), /eq\('scope', 'products'\)/);
  assert.match(read('security/sql/shopify-collections.sql'), /check \(scope in \('products','collections'\)\)/);
});

test('collection texts with hidden code or placeholders are reported, cleaned and restored exactly', async () => {
  const { col } = await load();
  const { issues } = plain(col.analyseCollections([C(1, { descriptionScripts: 1, descriptionNames: 1, descriptionPlaceholder: true, descriptionCssText: true })]));
  assert.deepEqual(issues[0].issues, ['col_script', 'col_placeholder', 'col_css']);
  assert.deepEqual(issues[0].fixes, [{ kind: 'col_clean', scripts: 1, names: 1 }]);
  const original = '<p>Bij [Bedrijfsnaam] vind je alles.</p><script type="application/ld+json">{"a":1}</script>';
  const state = { 'gid://shopify/Collection/1': { id: 1, title: 'Coll 1', descriptionHtml: original, seo: null, hidden: null } };
  const { db, writes } = fakeDb({ issues: [issue(1, [{ kind: 'col_clean', scripts: 1, names: 1 }])] });
  const { run } = await load(db);
  const r = plain(await run.applyCollectionFixes({ reportId: 'R1', collectionIds: ['gid://shopify/Collection/1'], kinds: ['col_clean'], actor: 'a' }, { db, client: fakeClient(state).client }));
  assert.equal(r.applied, 1);
  assert.equal(state['gid://shopify/Collection/1'].descriptionHtml, '<p>Bij Microforce vind je alles.</p>');
  const row = plain(writes[0].rows)[0];
  const { db: db2 } = fakeDb(null, { fix: { id: 7, report_id: 'R1', product_id: 'gid://shopify/Collection/1', title: 'Coll 1', kind: 'col_clean', result: 'ok', old_value: row.old_value, new_value: row.new_value } });
  const { run: run2 } = await load(db2);
  assert.equal(plain(await run2.revertCollectionFix({ fixId: 7, actor: 'a' }, { db: db2, client: fakeClient(state).client })).ok, true);
  assert.equal(state['gid://shopify/Collection/1'].descriptionHtml, original);
});
