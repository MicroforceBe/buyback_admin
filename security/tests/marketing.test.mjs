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
    { productId: '5', stock: 1, issues: ['description_short'], fixes: [{ kind: 'condition' }] },
  ];
  assert.deepEqual(plain(mk.seoScore({ checked: 10, issues })), { score: 60, inStockWithIssues: 3 });
  assert.equal(mk.seoScore(null), null);
  const a = plain(mk.topActions(issues));
  // An unrelated proposal (condition) does not make a short description fixable.
  assert.deepEqual(a.map(x => [x.code, x.inStock, x.fixable]), [['seo_raw', 2, 1], ['description_short', 1, 0], ['alt_missing', 1, 0]]);
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
  // The weekly totals read every page, not a capped result.
  assert.match(page, /range\(from, from \+ 999\)/);
  assert.doesNotMatch(page, /\.limit\(5000\)/);
});

async function loadGoogle() {
  const { generateKeyPairSync, createSign, createVerify } = await import('node:crypto');
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, URL, URLSearchParams, Buffer });
  const modules = new Map();
  const internal = { '@/lib/marketing/googleData': 'lib/marketing/googleData.ts', '@/lib/marketing/google': 'lib/marketing/google.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      const e = { 'server-only': {}, 'node:crypto': { createSign } }[spec];
      assert.ok(e, 'unexpected import ' + spec);
      return new vm.SyntheticModule(Object.keys(e), function () { for (const [k, v] of Object.entries(e)) this.setExport(k, v); }, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  return { data: (await ld('lib/marketing/googleData.ts')).namespace, google: (await ld('lib/marketing/google.ts')).namespace, privateKey, publicKey, createVerify };
}

test('service-account settings: parsed, escaped newlines restored, errors never echo the contents', async () => {
  const { data, privateKey } = await loadGoogle();
  assert.equal(data.parseServiceAccount(''), null);
  const sa = plain(data.parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'x@p.iam.gserviceaccount.com', private_key: privateKey.replace(/\n/g, '\\n'), project_id: 'p' })));
  assert.equal(sa.clientEmail, 'x@p.iam.gserviceaccount.com');
  assert.match(sa.privateKey, /^-----BEGIN PRIVATE KEY-----\n/);
  assert.throws(() => data.parseServiceAccount('{"secret": "abc'), e => /geen geldige JSON/.test(e.message) && !/abc/.test(e.message));
  assert.throws(() => data.parseServiceAccount('{"type":"user","private_key":"zzz"}'), e => /geen sleutel van een serviceaccount/.test(e.message) && !/zzz/.test(e.message));
});

test('access token: signed JWT bearer grant with read-only scopes, reused until it expires', async () => {
  const { data, google, privateKey, publicKey, createVerify } = await loadGoogle();
  const sa = data.parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'x@p.iam.gserviceaccount.com', private_key: privateKey }));
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, body: init.body }); return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) }; };
  assert.equal(await google.accessToken(sa, { fetch, now: () => 1_000_000 }), 'tok');
  assert.equal(await google.accessToken(sa, { fetch, now: () => 2_000_000 }), 'tok');
  assert.equal(calls.length, 1);
  const assertion = new URLSearchParams(calls[0].body).get('assertion');
  const [h, p, sig] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.equal(claims.iss, 'x@p.iam.gserviceaccount.com');
  assert.match(claims.scope, /webmasters\.readonly/);
  assert.match(claims.scope, /analytics\.readonly/);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')));
  // After expiry a new token is requested.
  await google.accessToken(sa, { fetch, now: () => 1_000_000 + 3_600_000 });
  assert.equal(calls.length, 2);
});

test('Search Console windows lag 3 days; GA4 and Merchant responses are summarised', async () => {
  const { data } = await loadGoogle();
  assert.deepEqual(plain(data.gscWindows(new Date('2026-11-07T22:00:00Z'))), { current: { start: '2026-10-08', end: '2026-11-04' }, previous: { start: '2026-09-10', end: '2026-10-07' } });
  assert.deepEqual(plain(data.gscTotals({ rows: [{ clicks: 5, impressions: 100, ctr: 0.05, position: 7.2 }] })), { clicks: 5, impressions: 100, ctr: 0.05, position: 7.2 });
  assert.deepEqual(plain(data.gscTotals({})), { clicks: 0, impressions: 0, ctr: 0, position: 0 });
  const ch = plain(data.ga4Channels({ rows: [
    { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '1' }, { value: '99.5' }] },
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '30' }, { value: '25' }, { value: '2' }, { value: 'x' }] },
  ] }));
  assert.deepEqual(ch.map(c => [c.channel, c.sessions, c.revenue]), [['Organic Search', 30, 0], ['Direct', 10, 99.5]]);
  const mc = plain(data.merchantSummary([
    { results: [
      { productView: { aggregatedReportingContextStatus: 'ELIGIBLE', itemIssues: [] } },
      { productView: { aggregatedReportingContextStatus: 'NOT_ELIGIBLE_OR_DISAPPROVED', itemIssues: [{ type: { code: 'missing_brand', canonicalAttribute: 'BRAND' } }, { type: { code: 'missing_brand' } }] } },
    ] },
    { results: [{ productView: { aggregatedReportingContextStatus: 'NOT_ELIGIBLE_OR_DISAPPROVED', itemIssues: [{ type: { code: 'missing_brand' } }, { type: { code: 'image_too_small' } }] } }] },
  ]));
  assert.equal(mc.products, 3);
  assert.deepEqual(mc.byStatus, { ELIGIBLE: 1, NOT_ELIGIBLE_OR_DISAPPROVED: 2 });
  assert.deepEqual(mc.issues.map(i => [i.code, i.products]), [['missing_brand', 2], ['image_too_small', 1]]);
  assert.equal(data.isMerchantUnregistered('GCP project with id x and number 1 is not registered with the merchant account.'), true);
  assert.equal(data.change(110, 100), 10);
  assert.equal(data.change(5, 0), null);
});

test('Merchant registration refuses a service-account address as technical contact; IDs must be numeric', async () => {
  const { data, google, privateKey } = await loadGoogle();
  const sa = data.parseServiceAccount(JSON.stringify({ type: 'service_account', client_email: 'x@p.iam.gserviceaccount.com', private_key: privateKey }));
  const fetch = async () => { throw new Error('no network expected'); };
  await assert.rejects(google.registerMerchant(sa, '123', 'x@p.iam.gserviceaccount.com', { fetch }), /persoon/);
  await assert.rejects(google.registerMerchant(sa, 'abc', 'olivier@microforce.be', { fetch }), /alleen cijfers/);
  await assert.rejects(google.analytics(sa, 'G-ABC', { fetch }), /alleen cijfers/);
});

test('marketing actions are admin-only', () => {
  const actions = read('app/admin/marketing/actions.ts');
  for (const body of actions.split('export async function').slice(1)) assert.match(body, /^\s*\w+\([^)]*\)\s*\{\s*(const user = )?await requireAccess\('erp', 'write', true\)/);
});
