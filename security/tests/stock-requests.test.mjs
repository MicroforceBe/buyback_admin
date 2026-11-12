import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(entry) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, Intl, Infinity, encodeURIComponent, parseInt });
  const modules = new Map();
  const internal = { '@/lib/shopify/soldOut': 'lib/shopify/soldOut.ts' };
  async function ld(path) {
    if (modules.has(path)) return modules.get(path);
    const code = ts.transpileModule(read(path), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const m = new vm.SourceTextModule(code, { context, identifier: path });
    modules.set(path, m);
    await m.link(async spec => {
      if (internal[spec]) return ld(internal[spec]);
      assert.equal(spec, 'server-only', 'unexpected import ' + spec);
      return new vm.SyntheticModule([], function () {}, { context });
    });
    if (m.status === 'linked') await m.evaluate();
    return m;
  }
  return (await ld(entry)).namespace;
}
const core = () => load('lib/stockRequests/core.ts');

test('macConfig reads chip, memory and storage from real MacBook handles', async () => {
  const { macConfig } = await core();
  assert.equal(macConfig('macbook-air-13-m2-2022-16gb-1tbssd-midnight-refurbished-5'), 'M2/16GB/1TB');
  assert.equal(macConfig('macbook-air-13-m2-8-gb-256ssd-sg-refurbished-4-m'), 'M2/8GB/256GB');
  assert.equal(macConfig('macbook-pro-14-m1-pro-2021-16gb-512gb-spagr-refurbished-3'), 'M1 Pro/16GB/512GB');
  assert.equal(macConfig('macbook-pro-16-m1-max-32gb-1-tb-ssd-silver-refurbished-5'), 'M1 Max/32GB/1TB');
  assert.equal(macConfig('iphone-13-128gb-blue-refurbished-4'), '');
  assert.equal(macConfig('macbook-air-13-m2-refurbished-5'), '');
});

test('parseRequest accepts a valid request and rejects bad input', async () => {
  const { parseRequest } = await core();
  const ok = { name: ' Jan  Peeters ', email: 'Jan@Example.BE ', language: 'fr', collection: 'refurbished-macbook-air-13-m2', configs: ['M2/16GB/1TB', 'M2/16GB/1TB', 'M2/8GB/256GB'], minGrade: 4, consent: true, website: '' };
  assert.deepEqual(plain(parseRequest(ok)), { ok: true, value: { name: 'Jan Peeters', email: 'jan@example.be', language: 'fr', collection: 'refurbished-macbook-air-13-m2', keys: ['M2/16GB/1TB', 'M2/8GB/256GB'], minGrade: 4 } });
  assert.equal(parseRequest({ ...ok, consent: false }).error, 'consent');
  assert.equal(parseRequest({ ...ok, website: 'http://spam' }).error, 'spam');
  for (const bad of [{ email: 'nope' }, { name: '<b>' }, { name: '' }, { collection: 'iphone-13' }, { configs: [] }, { configs: ['<script>'] }, { minGrade: 2 }, { configs: Array.from({ length: 13 }, (_, i) => `M2/8GB/${i + 1}GB`) }]) {
    assert.equal(parseRequest({ ...ok, ...bad }).error, 'invalid', JSON.stringify(bad));
  }
  assert.equal(parseRequest(null).error, 'invalid');
  assert.equal(parseRequest({ ...ok, language: 'de' }).value.language, 'nl');
});

test('matchRequests picks the cheapest active device in stock with at least the requested grade', async () => {
  const { matchRequests, groupByEmail } = await core();
  const req = (id, over = {}) => ({ id, name: 'Jan', email: 'jan@example.be', language: 'nl', collection_handle: 'c', config_key: 'M2/16GB/1TB', config_label: 'x', min_grade: 3, token: 't', ...over });
  const products = new Map([['c', [
    { handle: 'macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', status: 'ACTIVE', totalInventory: 1, price: 1199 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-sl-refurbished-3', status: 'ACTIVE', totalInventory: 2, price: 999 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-mn-refurbished-4', status: 'UNLISTED', totalInventory: 0, price: 1099 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-st-refurbished-4', status: 'ACTIVE', totalInventory: 0, price: 1050 },
    { handle: 'macbook-air-13-m2-8gb-256ssd-sg-refurbished-5', status: 'ACTIVE', totalInventory: 1, price: 799 },
  ]]]);
  const m = matchRequests([req('a'), req('b', { min_grade: 4 }), req('c', { config_key: 'M2/24GB/2TB' }), req('d', { collection_handle: 'other' }), req('e', { email: 'piet@example.be', config_key: 'M2/8GB/256GB', min_grade: 5 })], products);
  assert.deepEqual(plain(m.map(x => [x.request.id, x.product.handle, x.product.grade])), [
    ['a', 'macbook-air-13-m2-16gb-1tbssd-sl-refurbished-3', 3],
    ['b', 'macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', 5],
    ['e', 'macbook-air-13-m2-8gb-256ssd-sg-refurbished-5', 5],
  ]);
  assert.deepEqual([...groupByEmail(m).entries()].map(([k, v]) => [k, v.length]), [['jan@example.be', 2], ['piet@example.be', 1]]);
});

test('mails are localised, escape customer input and carry the unsubscribe link', async () => {
  const { confirmationMail, availableMail, unsubscribeUrl, adminBaseUrl, productUrl } = await core();
  const link = unsubscribeUrl(adminBaseUrl({}), '11111111-1111-4111-8111-111111111111', 'fr');
  assert.equal(link, 'https://buyback-admin.vercel.app/api/public/aanvraag/uitschrijven?t=11111111-1111-4111-8111-111111111111&l=fr');
  assert.equal(adminBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'admin.microforce.be' }), 'https://admin.microforce.be');
  assert.equal(adminBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'evil.com/x?' }), 'https://buyback-admin.vercel.app');
  const c = confirmationMail('fr', 'Jan <b>', ['M2/16GB/1TB'], 4, link);
  assert.match(c.subject, /alerte/);
  assert.match(c.html, /M2 · 16 Go mémoire · 1 To stockage/);
  assert.match(c.html, /Très bon ou mieux/);
  assert.ok(!c.html.includes('<b>') && c.html.includes('Jan &lt;b&gt;'));
  assert.ok(c.html.includes(link.replace(/&/g, '&amp;')) && c.text.includes(link));
  const a = availableMail('en', 'Jan', [{ request: { config_key: 'M2/16GB/1TB' }, product: { handle: 'macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', grade: 5, price: 1199 } }], link);
  assert.match(a.html, /Like new/);
  assert.ok(a.html.includes(productUrl('macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', 'en')));
  assert.equal(productUrl('x', 'nl'), 'https://microforce.be/products/x');
  assert.match(a.html, /1,199\.00/);
});

test('demand summary counts open requests per configuration and grade', async () => {
  const { demandSummary, collectionName } = await core();
  const now = Date.parse('2026-11-12T12:00:00Z');
  const rows = [
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', min_grade: 3, status: 'open', created_at: '2026-11-10T10:00:00Z', notified_at: null },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', min_grade: 5, status: 'open', created_at: '2026-11-01T10:00:00Z', notified_at: null },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', min_grade: 4, status: 'notified', created_at: '2026-11-01T10:00:00Z', notified_at: '2026-11-05T10:00:00Z' },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/8GB/256GB', min_grade: 3, status: 'notified', created_at: '2026-09-01T10:00:00Z', notified_at: '2026-09-02T10:00:00Z' },
    { collection_handle: 'refurbished-macbook-pro-14-m1-pro-max', config_key: 'M1 Pro/16GB/512GB', min_grade: 3, status: 'unsubscribed', created_at: '2026-11-01T10:00:00Z', notified_at: null },
  ];
  assert.deepEqual(plain(demandSummary(rows, now)), [
    { collection: 'refurbished-macbook-air-13-m2', config: 'M2/16GB/1TB', open: 2, byGrade: { 3: 1, 4: 0, 5: 1 }, oldest: '2026-11-01T10:00:00Z', notified30: 1 },
  ]);
  assert.equal(collectionName('refurbished-macbook-air-13-m2'), 'MacBook Air 13 M2');
});

test('unsubscribe page only unsubscribes on POST and the public routes stay narrow', async () => {
  const { unsubscribePage } = await core();
  const ask = unsubscribePage('nl', 'ask', '11111111-1111-4111-8111-111111111111');
  assert.match(ask, /<form method="post">/);
  assert.match(ask, /noindex/);
  const route = read('app/api/public/aanvraag/uitschrijven/route.ts');
  assert.ok(!/export async function GET[\s\S]*?\.update\(/.test(route.split('export async function POST')[0]), 'GET must not write');
  const post = read('app/api/public/aanvraag/route.ts');
  assert.match(post, /origins\(\)\.includes\(request\.headers\.get\('origin'\)/);
  assert.match(post, /configLabel\(key, 'nl'\)/, 'labels are built server side');
  assert.ok(!/console\.(error|log|info)\([^)]*(email|name)/.test(post), 'no personal data in logs');
  const sql = read('security/sql/shop-stock-requests.sql');
  assert.match(sql, /revoke all on public\.shop_stock_requests from public, anon, authenticated/);
  assert.match(sql, /enable row level security/);
  const cron = JSON.parse(read('vercel.json')).crons.find(c => c.path === '/api/stock-requests');
  assert.equal(cron?.schedule, '20 * * * *');
  assert.match(read('app/api/stock-requests/route.ts'), /bearerMatches\(request\.headers\.get\('authorization'\), process\.env\.CRON_SECRET\)/);
});
