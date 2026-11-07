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
  const internal = { '@/lib/shopify/enrich': 'lib/shopify/enrich.ts', '@/lib/shopify/seo': 'lib/shopify/seo.ts', '@/lib/shopify/plan': 'lib/shopify/plan.ts', '@/lib/shopify/client': 'lib/shopify/client.ts', '@/lib/shopify/catalog': 'lib/shopify/catalog.ts', '@/lib/shopify/catalogRun': 'lib/shopify/catalogRun.ts' };
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
  condition: '4* Zeer Goed', colour: 'Blauw', refurbished: true, skus: [`20500000000${n}`], images: [{ width: 1200, height: 1200, alt: 'foto' }], collections: 1,
  seoTitle: 'SEO titel', seoDescription: `Meta ${n}`, warranty: '24 maanden', descriptionWords: 150, descriptionBlank: false, descriptionHash: `h${n}`, descriptionH1: false, descriptionEmptyImage: false, descriptionOtherModel: false, ...over,
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
  assert.deepEqual(p.images, [{ width: 800, height: 600, alt: '' }]);
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
    P(2, { title: 'iPad 9 64GB 3*', images: [{ width: 600, height: 600, alt: 'a' }, { width: 1500, height: 100, alt: 'b' }], condition: '5* Als Nieuw' }),
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

test('SEO title and meta description follow the shop style and stay within the limits', async () => {
  const { seo } = await loadSeo();
  assert.equal(seo.seoName('iPhone 14 Plus 128GB Purple Refurbished 4* M'), 'iPhone 14 Plus 128GB Purple');
  assert.equal(seo.suggestSeoTitle('iPhone 13 128GB Blue Refurbished 4* M', true), 'Refurbished iPhone 13 128GB Blue – Zeer Goed | Microforce');
  const long = seo.suggestSeoTitle('iPhone 14 Plus 128GB Purple Refurbished 4* M', true);
  assert.equal(long, 'Refurbished iPhone 14 Plus 128GB Purple – Zeer Goed');
  assert.equal(seo.suggestSeoTitle('Apple USB-C kabel 1M', false), 'Apple USB-C kabel 1M kopen - Microforce');
  for (const t of ['MacBook Pro 16" L21 M1 Max 64GB 2TB SSD SG Refurbished 4*', 'Dell Precision 7560 Xeon 64GB 1TB SSD 15" Touch Refurbished 5* Extra Lange Naam']) {
    assert.ok(seo.suggestSeoTitle(t, true).length <= 60);
    assert.ok(seo.suggestSeoDescription(t, true, '24 maanden').length <= 155);
  }
  const d = seo.suggestSeoDescription('iPhone 13 128GB Blue Refurbished 4* M', true, '24 maanden');
  assert.equal(d, 'Koop refurbished iPhone 13 128GB Blue in conditie Zeer Goed bij Microforce met 24 maanden garantie. Gratis afhalen of snelle levering in België.');
  assert.doesNotMatch(d, /€/);
});

test('description checks: words, duplicates, extra H1, empty image and another model in the headings', async () => {
  const { seo } = await loadSeo();
  assert.equal(seo.wordCount('<p>een <b>twee</b>&nbsp;drie</p>'), 3);
  assert.equal(seo.textHash('<p>Zelfde  tekst</p>'), seo.textHash('<div>zelfde tekst</div>'));
  assert.equal(seo.textHash(''), null);
  assert.equal(seo.hasH1('<h1>x</h1>'), true);
  assert.equal(seo.hasH1('<h2>x</h2>'), false);
  assert.equal(seo.hasEmptyImage('<p><img></p>'), true);
  assert.equal(seo.hasEmptyImage('<img alt="x" src="https://cdn/x.jpg">'), false);
  const wrong = '<h1>Refurbished iPhone 14: Innovatie</h1><h2>iPhone 14 Specificaties</h2>';
  assert.equal(seo.mentionsOtherModel('iPhone 14 Plus 128GB Purple Refurbished 4* M', wrong), true);
  assert.equal(seo.mentionsOtherModel('iPhone 14 128GB Purple Refurbished 4* M', wrong), false);
  assert.equal(seo.mentionsOtherModel('MacBook Pro 13" M1 8GB 512SSD Refurbished 4*', wrong), false);
  // A longer model name never counts for a shorter one, and the other way round.
  const proMax = '<h2>iPhone 14 Pro Max specificaties</h2>';
  assert.equal(seo.mentionsOtherModel('iPhone 14 128GB Blue Refurbished 4* M', proMax), true);
  assert.equal(seo.mentionsOtherModel('iPhone 14 Pro 128GB Purple Refurbished 4* M', proMax), true);
  assert.equal(seo.mentionsOtherModel('iPhone 14 Pro Max 128GB Purple Refurbished 4* M', proMax), false);
  assert.equal(seo.mentionsOtherModel('iPhone 13 Mini 128GB Blue Refurbished 4* M', '<h2>iPhone 13 mini</h2>'), false);
  assert.equal(seo.mentionsOtherModel('iPhone 16e 128GB White Refurbished 4* M', '<h2>iPhone 16</h2>'), true);
  assert.equal(seo.isBlankDescription(''), true);
  assert.equal(seo.isBlankDescription('<p> </p>'), true);
  assert.equal(seo.isBlankDescription('<p>Kort</p>'), false);
  assert.equal(seo.isBlankDescription('<img src="x.jpg">'), false);
});

test('a description is only taken over from the same model with a substantial text', async () => {
  const { seo } = await loadSeo();
  const text = n => '<h2>iPhone 14 Plus</h2><p>' + 'woord '.repeat(n) + '</p>';
  const refs = [
    { title: 'iPhone 14 128GB Purple Refurbished 4* M', descriptionHtml: text(500) },
    { title: 'iPhone 14 Plus 256GB Blue Refurbished 5* M', descriptionHtml: text(150) },
    { title: 'iPhone 14 Plus 128GB Red Refurbished 3* M', descriptionHtml: text(300) },
    { title: 'iPhone 14 Plus 512GB Black Refurbished 3* M', descriptionHtml: '<h2>iPhone 14</h2><p>' + 'woord '.repeat(900) + '</p>' },
    { title: 'iPhone 14 Plus 64GB Black Refurbished 3* M', descriptionHtml: text(50) },
  ];
  assert.equal(seo.pickDescription('iPhone 14 Plus 128GB Purple Refurbished 4* M', refs).title, 'iPhone 14 Plus 128GB Red Refurbished 3* M');
  assert.equal(seo.pickDescription('iPhone 15 128GB Purple Refurbished 4* M', refs), null);
});

test('SEO and description issues are reported with fix proposals', async () => {
  const { catalog } = await load();
  const r = plain(catalog.analyseCatalog([
    P(1, { title: 'iPhone 13 128GB Blue Refurbished 4* M', seoTitle: '', seoDescription: '', descriptionWords: 0, descriptionBlank: true, descriptionHash: null, images: [{ width: 1200, height: 1200, alt: '' }] }),
    P(2, { title: 'iPhone 13 256GB Black Refurbished 5* M', condition: '5* Als Nieuw', descriptionWords: 400, descriptionHash: 'same' }),
    P(4, { title: 'iPhone 13 64GB Red Refurbished 4* M', descriptionWords: 5, descriptionBlank: false }),
    P(3, { title: 'iPhone 13 128GB Pink Refurbished 3* M', condition: '3* Goed', descriptionWords: 300, descriptionHash: 'same', seoTitle: 'x'.repeat(61), descriptionH1: true, descriptionEmptyImage: true }),
  ]));
  const by = Object.fromEntries(r.issues.map(i => [i.productId.split('/').pop(), i]));
  assert.deepEqual(by[1].issues, ['seo_title_missing', 'seo_description_missing', 'description_empty', 'alt_missing']);
  assert.deepEqual(by[1].fixes, [
    { kind: 'seo', title: 'Refurbished iPhone 13 128GB Blue – Zeer Goed | Microforce', description: 'Koop refurbished iPhone 13 128GB Blue in conditie Zeer Goed bij Microforce met 24 maanden garantie. Gratis afhalen of snelle levering in België.' },
    { kind: 'description', fromProductId: 'gid://shopify/Product/2', fromTitle: 'iPhone 13 256GB Black Refurbished 5* M' },
  ]);
  assert.deepEqual(by[2].issues, ['description_duplicate']);
  assert.deepEqual(by[4].issues, ['description_empty']);
  assert.deepEqual(by[4].fixes, []);
  assert.deepEqual(by[3].issues, ['seo_too_long', 'description_duplicate', 'description_h1', 'description_empty_image']);
  assert.deepEqual(by[3].fixes.map(f => f.kind), ['seo_replace']);
});

async function loadSeo() {
  const context = vm.createContext({ Set, Map, Object, Array, String, RegExp, Number, JSON, Math });
  const mods = {};
  for (const p of ['lib/shopify/enrich.ts', 'lib/shopify/seo.ts']) {
    const code = ts.transpileModule(read(p), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    mods[p] = new vm.SourceTextModule(code, { context, identifier: p });
  }
  await mods['lib/shopify/enrich.ts'].link(() => { throw new Error('no imports'); });
  await mods['lib/shopify/seo.ts'].link(spec => { assert.equal(spec, '@/lib/shopify/enrich'); return mods['lib/shopify/enrich.ts']; });
  await mods['lib/shopify/seo.ts'].evaluate();
  return { seo: mods['lib/shopify/seo.ts'].namespace };
}

function fakeDb(report, { fix = null, reverted = false } = {}) {
  const writes = [];
  const from = table => {
    const q = { ops: [] };
    const result = () => {
      const ins = q.ops.find(o => o[0] === 'insert');
      if (ins) { writes.push({ table, rows: ins[1] }); return table === 'shopify_catalog_reports' ? { data: { id: 'R1' }, error: null } : { error: null }; }
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
function fakeClient(products) {
  const calls = [];
  return { calls, client: { graphql: async (query, vars) => {
    const name = query.match(/(?:query|mutation) (\w+)/)[1];
    calls.push({ name, vars: plain(vars) });
    if (name === 'CatalogProduct') return { product: products[vars.id] ?? null };
    if (name === 'SyncMetafields') return { metafieldsSet: { userErrors: [] } };
    if (name === 'CatalogTagsAdd') return { tagsAdd: { userErrors: [] } };
    if (name === 'CatalogTagsRemove') return { tagsRemove: { userErrors: [] } };
    if (name === 'CatalogDescriptionSource') return { product: products[vars.id] ?? null };
    if (name === 'CatalogProductUpdate') return { productUpdate: { userErrors: [] } };
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

test('SEO fixes never overwrite existing texts and descriptions come from a still valid source', async () => {
  const seoFix = { kind: 'seo', title: 'Nieuwe titel', description: 'Nieuwe meta' };
  const descFix = { kind: 'description', fromProductId: 'gid://shopify/Product/9', fromTitle: 'iPhone 13 256GB Black Refurbished 5* M' };
  const t = 'iPhone 13 128GB Zwart 5*';
  const { db } = fakeDb({ issues: [issue(1, [seoFix, descFix], t), issue(2, [seoFix], t), issue(3, [descFix], t)] });
  const { run } = await load(db);
  const fake = fakeClient({
    'gid://shopify/Product/1': { id: 1, title: t, tags: [], descriptionHtml: '', seo: { title: 'Bestaande titel', description: null }, condition: null },
    'gid://shopify/Product/2': { id: 2, title: t, tags: [], descriptionHtml: '', seo: { title: 'A', description: 'B' }, condition: null },
    'gid://shopify/Product/3': { id: 3, title: t, tags: [], descriptionHtml: '<p>Korte eigen tekst</p>', seo: null, condition: null },
    'gid://shopify/Product/9': { id: 9, title: 'iPhone 13 256GB Black Refurbished 5* M', descriptionHtml: '<p>' + 'tekst '.repeat(200) + '</p>' },
  });
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: [1, 2, 3].map(n => `gid://shopify/Product/${n}`), kinds: ['seo', 'description'], actor: 'a' }, { db, client: fake.client }));
  assert.deepEqual(r, { applied: 2, skipped: 2, failed: 0 });
  const updates = fake.calls.filter(c => c.name === 'CatalogProductUpdate').map(c => c.vars.product);
  assert.deepEqual(updates[0], { id: 'gid://shopify/Product/1', seo: { title: 'Bestaande titel', description: 'Nieuwe meta' } });
  // The TinySEO skip tag goes on before the SEO text is written.
  const names = fake.calls.map(c => c.name);
  assert.ok(names.indexOf('CatalogTagsAdd') < names.indexOf('CatalogProductUpdate'));
  assert.deepEqual(fake.calls.find(c => c.name === 'CatalogTagsAdd').vars.tags, ['tinyimg_metadata_skip']);
  assert.match(updates[1].descriptionHtml, /tekst/);
  assert.equal(updates.length, 2);
});

test('weak SEO texts are recognised and get a replacement proposal with the old text', async () => {
  const { seo } = await loadSeo();
  assert.equal(seo.seoIsRaw('iPhone 13 256GB Midnight Refurbished 3* M kopen - Microforce', 'x'), true);
  assert.equal(seo.seoIsRaw('Apple USB-C kabel kopen - Microforce', ''), true);
  assert.equal(seo.seoIsRaw('Refurbished iPhone 13 – Zeer Goed | Microforce', 'Koop'), false);
  assert.equal(seo.seoConditionMismatch('iPhone 13 128GB Blue Refurbished 5* M', 'Refurbished iPhone 13 – Zeer Goed', ''), true);
  assert.equal(seo.seoConditionMismatch('iPhone 13 128GB Blue Refurbished 4* M', 'Refurbished iPhone 13 – Zeer Goed', 'goed getest'), false);
  assert.equal(seo.seoConditionMismatch('iPhone 13 128GB Blue Refurbished 3* M', 'x', 'in conditie Goed'), false);
  assert.equal(seo.seoConditionMismatch('iPhone 13 128GB Blue Refurbished 3* M', 'x 4*', ''), true);

  const { catalog } = await load();
  const t = 'iPhone 13 128GB Blue Refurbished 4* M';
  const r = plain(catalog.analyseCatalog([
    P(1, { title: t, seoTitle: `${t} kopen - Microforce`, seoDescription: 'Koop vanaf €299 bij Microforce met garantie!' }),
    P(2, { title: 'iPhone 13 256GB Black Refurbished 4* M', seoTitle: 'Goede titel', seoDescription: 'Zelfde meta' }),
    P(3, { title: 'iPhone 13 256GB Pink Refurbished 4* M', seoTitle: 'Andere titel', seoDescription: 'Zelfde meta' }),
  ]));
  const by = Object.fromEntries(r.issues.map(i => [i.productId.split('/').pop(), i]));
  assert.deepEqual(by[1].issues, ['seo_raw']);
  assert.deepEqual(by[1].fixes, [{ kind: 'seo_replace', title: 'Refurbished iPhone 13 128GB Blue – Zeer Goed | Microforce', description: 'Koop refurbished iPhone 13 128GB Blue in conditie Zeer Goed bij Microforce met 24 maanden garantie. Gratis afhalen of snelle levering in België.', oldTitle: `${t} kopen - Microforce`, oldDescription: 'Koop vanaf €299 bij Microforce met garantie!' }]);
  assert.deepEqual(by[2].issues, ['seo_description_duplicate']);
  assert.equal(by[2].fixes[0].kind, 'seo_replace');
});

test('a replacement is skipped when the SEO text changed after the report; applied ones keep the old text', async () => {
  const t = 'iPhone 13 128GB Zwart 5*';
  const fix = { kind: 'seo_replace', title: 'Nieuw', description: 'Nieuwe meta', oldTitle: 'Oud', oldDescription: 'Oude meta' };
  const { db, writes } = fakeDb({ issues: [issue(1, [fix], t), issue(2, [fix], t)] });
  const { run } = await load(db);
  const fake = fakeClient({
    'gid://shopify/Product/1': { id: 1, title: t, tags: ['tinyimg_metadata_skip'], descriptionHtml: '', seo: { title: 'Oud', description: 'Oude meta' }, condition: null },
    'gid://shopify/Product/2': { id: 2, title: t, tags: [], descriptionHtml: '', seo: { title: 'Door iemand aangepast', description: 'Oude meta' }, condition: null },
  });
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], kinds: ['seo_replace'], actor: 'a' }, { db, client: fake.client }));
  assert.deepEqual(r, { applied: 1, skipped: 1, failed: 0 });
  assert.ok(!fake.calls.some(c => c.name === 'CatalogTagsAdd'), 'skip tag already present');
  const log = plain(writes.filter(w => w.table === 'shopify_catalog_fixes').flatMap(w => w.rows));
  assert.deepEqual(log[0].old_value, { title: 'Oud', description: 'Oude meta', skipTagAdded: false });
  assert.deepEqual(log[0].new_value, { title: 'Nieuw', description: 'Nieuwe meta' });
  assert.match(log[1].detail, /gewijzigd/);
});

test('a failed SEO update takes the skip tag off again', async () => {
  const t = 'iPhone 13 128GB Zwart 5*';
  const { db } = fakeDb({ issues: [issue(1, [{ kind: 'seo', title: 'T', description: 'D' }], t)] });
  const { run } = await load(db);
  const fake = fakeClient({ 'gid://shopify/Product/1': { id: 1, title: t, tags: [], descriptionHtml: '', seo: null, condition: null } });
  const original = fake.client.graphql;
  fake.client.graphql = async (q, v) => (q.includes('CatalogProductUpdate') ? Promise.reject(new Error('netwerk')) : original(q, v));
  const r = plain(await run.applyCatalogFixes({ reportId: 'R1', productIds: ['gid://shopify/Product/1'], kinds: ['seo'], actor: 'a' }, { db, client: fake.client }));
  assert.equal(r.failed, 1);
  assert.deepEqual(fake.calls.map(c => c.name).filter(n => n.startsWith('CatalogTags')), ['CatalogTagsAdd', 'CatalogTagsRemove']);
});

test('undo restores the old SEO texts and hands the product back to TinySEO, once and only if unchanged', async () => {
  const fixRow = { id: 7, report_id: 'R1', product_id: 'gid://shopify/Product/1', title: 'X', kind: 'seo_replace', result: 'ok',
    old_value: { title: 'Oud', description: null, skipTagAdded: true }, new_value: { title: 'Nieuw', description: 'Nieuwe meta' } };
  const product = seo => ({ 'gid://shopify/Product/1': { id: 1, title: 'X', tags: ['cat_x', 'tinyimg_metadata_skip'], seo } });
  {
    const { db, writes } = fakeDb(null, { fix: fixRow });
    const { run } = await load(db);
    const fake = fakeClient(product({ title: 'Nieuw', description: 'Nieuwe meta' }));
    const r = plain(await run.revertCatalogFix({ fixId: 7, actor: 'a' }, { db, client: fake.client }));
    assert.equal(r.ok, true);
    assert.deepEqual(fake.calls.find(c => c.name === 'CatalogProductUpdate').vars.product.seo, { title: 'Oud', description: '' });
    assert.deepEqual(fake.calls.find(c => c.name === 'CatalogTagsRemove').vars.tags, ['tinyimg_metadata_skip']);
    const row = plain(writes[0].rows);
    assert.equal(row.kind, 'revert');
    assert.equal(row.reverts, 7);
  }
  {
    const { db } = fakeDb(null, { fix: fixRow });
    const { run } = await load(db);
    const fake = fakeClient(product({ title: 'Iemand anders', description: 'Nieuwe meta' }));
    const r = plain(await run.revertCatalogFix({ fixId: 7, actor: 'a' }, { db, client: fake.client }));
    assert.equal(r.ok, false);
    assert.ok(!fake.calls.some(c => c.name === 'CatalogProductUpdate'));
  }
  {
    const { db } = fakeDb(null, { fix: fixRow, reverted: true });
    const { run } = await load(db);
    await assert.rejects(run.revertCatalogFix({ fixId: 7, actor: 'a' }, { db, client: fakeClient({}).client }), /al teruggedraaid/);
  }
  {
    const { db } = fakeDb(null, { fix: { ...fixRow, kind: 'condition' } });
    const { run } = await load(db);
    await assert.rejects(run.revertCatalogFix({ fixId: 7, actor: 'a' }, { db, client: fakeClient({}).client }), /kan niet/);
  }
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
