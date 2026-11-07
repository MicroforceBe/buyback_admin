import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load() {
  const context = vm.createContext({ TextEncoder, console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams });
  const modules = new Map();
  const internal = { '@/lib/shopify/enrich': 'lib/shopify/enrich.ts', '@/lib/shopify/seo': 'lib/shopify/seo.ts', '@/lib/shopify/plan': 'lib/shopify/plan.ts', '@/lib/shopify/catalog': 'lib/shopify/catalog.ts', '@/lib/shopify/collections': 'lib/shopify/collections.ts', '@/lib/marketing/overview': 'lib/marketing/overview.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => { assert.ok(internal[spec], 'unexpected import ' + spec); return ld(internal[spec]); });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return (await ld('lib/marketing/overview.ts')).namespace;
}

test('metrics: newest count, change since the previous report and an old → new trend', async () => {
  const mk = await load();
  const reports = [
    { id: 'c', created_at: '3', checked: 10, counts: { seo_raw: 4, alt_missing: 9 } },
    { id: 'b', created_at: '2', checked: 10, counts: { seo_raw: 7 } },
    { id: 'a', created_at: '1', checked: 10, counts: { seo_raw: 9, alt_missing: 12 } },
  ];
  const m = plain(mk.metrics(reports, ['seo_raw', 'alt_missing'], { seo_raw: 'Ruw', alt_missing: 'Alt' }));
  assert.deepEqual(m[0], { code: 'seo_raw', label: 'Ruw', now: 4, delta: -3, trend: [9, 7, 4] });
  // A check that did not exist in the previous report has no change.
  assert.equal(m[1].delta, null);
  assert.deepEqual(plain(mk.metrics([], ['seo_raw'], { seo_raw: 'Ruw' }))[0], { code: 'seo_raw', label: 'Ruw', now: 0, delta: null, trend: [] });
});

test('SEO score and first actions only count findability issues; actions only products in stock', async () => {
  const mk = await load();
  const issues = [
    { productId: '1', stock: 2, issues: ['seo_raw', 'no_photo'], fixes: [{ kind: 'seo_replace' }] },
    { productId: '2', stock: 0, issues: ['seo_raw'], fixes: [] },
    { productId: '3', stock: 1, issues: ['no_photo'], fixes: [] },
    { productId: '4', stock: 3, issues: ['seo_raw', 'alt_missing'], fixes: [] },
  ];
  assert.deepEqual(plain(mk.seoScore({ checked: 10, issues })), { score: 70, inStockWithIssues: 2 });
  assert.equal(mk.seoScore(null), null);
  const a = plain(mk.topActions(issues));
  assert.deepEqual(a.map(x => [x.code, x.inStock, x.fixable]), [['seo_raw', 2, 1], ['alt_missing', 1, 0]]);
});

test('sources are connected only when every setting is present; values are never returned', async () => {
  const mk = await load();
  const s = plain(mk.sourceStatus({ MAILCHIMP_API_KEY: 'secret-value', TRUSTPILOT_API_KEY: 'x', TRUSTPILOT_BUSINESS_UNIT_ID: ' ' }));
  const by = Object.fromEntries(s.map(x => [x.source.key, x]));
  assert.equal(by.mailchimp.connected, true);
  assert.equal(by.trustpilot.connected, false);
  assert.deepEqual(by.trustpilot.missing, ['TRUSTPILOT_BUSINESS_UNIT_ID']);
  assert.doesNotMatch(JSON.stringify(s), /secret-value/);
  assert.equal(s.length, 8);
});

test('the marketing page is behind the ERP permission and never prints setting values', () => {
  const page = read('app/admin/marketing/page.tsx');
  assert.match(page, /await requirePageAccess\('erp'\)/);
  assert.doesNotMatch(page, /process\.env\.[A-Z_]+/);
  assert.match(page, /sourceStatus\(process\.env\)/);
});
