import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const plain = v => JSON.parse(JSON.stringify(v));
const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

async function load(entry) {
  const context = vm.createContext({ console, Date, Number, Object, Error, String, Array, RegExp, Set, Map, Math, Promise, JSON, Intl, Infinity, encodeURIComponent, parseInt, URL });
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
  const ok = { name: ' Jan  Peeters ', email: 'Jan@Example.BE ', language: 'fr', collection: 'refurbished-macbook-air-13-m2', configs: ['M2/16GB/1TB', 'M2/16GB/1TB', 'M2/8GB/256GB'], grades: [5, 4, 4], consent: true, website: '' };
  assert.deepEqual(plain(parseRequest(ok)), { ok: true, value: { name: 'Jan Peeters', email: 'jan@example.be', language: 'fr', collection: 'refurbished-macbook-air-13-m2', keys: ['M2/16GB/1TB', 'M2/8GB/256GB'], grades: [4, 5], consentVersion: 'v1' } });
  assert.equal(parseRequest({ ...ok, consentVersion: 'nl-2026-11-12' }).value.consentVersion, 'nl-2026-11-12');
  assert.equal(parseRequest({ ...ok, consentVersion: '<x>' }).value.consentVersion, 'v1');
  assert.deepEqual(plain(parseRequest({ ...ok, grades: undefined }).value.grades), [3, 4, 5]);
  assert.equal(parseRequest({ ...ok, consent: false }).error, 'consent');
  assert.equal(parseRequest({ ...ok, website: 'http://spam' }).error, 'spam');
  for (const bad of [{ email: 'nope' }, { name: '<b>' }, { name: 'Bezoek www.x' }, { name: '' }, { collection: 'iphone-13' }, { configs: [] }, { configs: ['<script>'] }, { grades: [2] }, { grades: [] }, { grades: 'x' }, { configs: Array.from({ length: 13 }, (_, i) => `M2/8GB/${i + 1}GB`) }]) {
    assert.equal(parseRequest({ ...ok, ...bad }).error, 'invalid', JSON.stringify(bad));
  }
  assert.equal(parseRequest(null).error, 'invalid');
  assert.equal(parseRequest({ ...ok, language: 'de' }).value.language, 'nl');
});

test('matchRequests picks the cheapest active device in stock in one of the chosen grades', async () => {
  const { matchRequests, groupByEmail } = await core();
  const req = (id, over = {}) => ({ id, name: 'Jan', email: 'jan@example.be', language: 'nl', collection_handle: 'c', config_key: 'M2/16GB/1TB', config_label: 'x', grades: [3, 4, 5], token: 't', ...over });
  const products = new Map([['c', [
    { handle: 'macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', status: 'ACTIVE', totalInventory: 1, price: 1199 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-sl-refurbished-3', status: 'ACTIVE', totalInventory: 2, price: 999 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-mn-refurbished-4', status: 'UNLISTED', totalInventory: 0, price: 1099 },
    { handle: 'macbook-air-13-m2-16gb-1tbssd-st-refurbished-4', status: 'ACTIVE', totalInventory: 0, price: 1050 },
    { handle: 'macbook-air-13-m2-8gb-256ssd-sg-refurbished-5', status: 'ACTIVE', totalInventory: 1, price: 799 },
  ]]]);
  const m = matchRequests([req('a'), req('b', { grades: [4, 5] }), req('c', { config_key: 'M2/24GB/2TB' }), req('d', { collection_handle: 'other' }), req('e', { email: 'piet@example.be', config_key: 'M2/8GB/256GB', grades: [5] }), req('f', { grades: [4] })], products);
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
  assert.equal(adminBaseUrl({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'x-git-y.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'p.vercel.app' }), 'https://x-git-y.vercel.app');
  assert.equal(adminBaseUrl({ VERCEL_ENV: 'production', VERCEL_BRANCH_URL: 'x-git-y.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'p.vercel.app' }), 'https://p.vercel.app');
  const c = confirmationMail('fr', 'Jan <b>', ['M2/16GB/1TB'], [4, 5], link);
  assert.match(c.subject, /Merci pour votre demande/);
  assert.match(c.html, /microforce-logo/);
  assert.match(c.html, /https:\/\/buyback-admin\.vercel\.app\/mail\/micro-mike-zoek\.png/);
  assert.match(c.html, /Je pars déjà à la recherche pour vous/);
  assert.match(c.html, /Trustpilot/);
  assert.match(c.html, /M2 · 16 Go mémoire · 1 To stockage/);
  assert.match(c.text, /État : Très bon ou Comme neuf\./);
  assert.match(c.html, /&#9733;&#9733;&#9733;&#9733;<\/span><span[^>]*>&#9733;<\/span>&nbsp; <b>Très bon<\/b>/);
  assert.match(confirmationMail('nl', 'Jan', ['M2/16GB/1TB'], [3, 4, 5], link).text, /Elke staat is goed/);
  assert.ok(!c.html.includes('Jan <b>') && c.html.includes('Jan &lt;b&gt;'));
  assert.ok(c.html.includes(link.replace(/&/g, '&amp;')) && c.text.includes(link));
  const a = availableMail('en', 'Jan', [{ request: { config_key: 'M2/16GB/1TB' }, product: { handle: 'macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', grade: 5, price: 1199 } }], link);
  assert.match(a.html, /Like new/);
  assert.match(a.html, /I found something for you!/);
  assert.ok(a.html.includes(productUrl('macbook-air-13-m2-16gb-1tbssd-sg-refurbished-5', 'en')));
  assert.equal(productUrl('x', 'nl'), 'https://microforce.be/products/x');
  assert.match(a.html, /1,199\.00/);
});

test('demand summary counts open requests per configuration and grade', async () => {
  const { demandSummary, collectionName } = await core();
  const now = Date.parse('2026-11-12T12:00:00Z');
  const rows = [
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', grades: [3, 4, 5], status: 'open', created_at: '2026-11-10T10:00:00Z', notified_at: null },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', grades: [5], status: 'open', created_at: '2026-11-01T10:00:00Z', notified_at: null },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/16GB/1TB', grades: [4], status: 'notified', created_at: '2026-11-01T10:00:00Z', notified_at: '2026-11-05T10:00:00Z' },
    { collection_handle: 'refurbished-macbook-air-13-m2', config_key: 'M2/8GB/256GB', grades: [3], status: 'notified', created_at: '2026-09-01T10:00:00Z', notified_at: '2026-09-02T10:00:00Z' },
    { collection_handle: 'refurbished-macbook-pro-14-m1-pro-max', config_key: 'M1 Pro/16GB/512GB', grades: [3], status: 'unsubscribed', created_at: '2026-11-01T10:00:00Z', notified_at: null },
  ];
  assert.deepEqual(plain(demandSummary(rows, now)), [
    { collection: 'refurbished-macbook-air-13-m2', config: 'M2/16GB/1TB', open: 2, byGrade: { 3: 1, 4: 1, 5: 2 }, oldest: '2026-11-01T10:00:00Z', notified30: 1 },
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

test('sender is always Microforce klantenservice', async () => {
  const { shopSender, confirmationMail } = await core();
  assert.equal(shopSender('klantenservice <klantenservice@microforce.be>'), 'Microforce klantenservice <klantenservice@microforce.be>');
  assert.equal(shopSender('info@microforce.be'), 'Microforce klantenservice <info@microforce.be>');
  assert.equal(shopSender(''), '');
  assert.equal(shopSender('geen adres'), '');
  const nl = confirmationMail('nl', 'Olivier', ['M2/16GB/512GB'], [3, 4, 5], 'https://x.vercel.app/api/public/aanvraag/uitschrijven?t=1&l=nl');
  assert.match(nl.html, /Bedankt voor jouw aanvraag/);
  assert.match(nl.html, /We gaan aan de slag om zo snel mogelijk het geschikte toestel voor jou te vinden\. Als jouw gewenst model bestelbaar is of terug op voorraad is, brengen we je op de hoogte\./);
  assert.match(nl.html, /Ik ga alvast op zoek voor jou\./);
  assert.match(nl.html, /https:\/\/x\.vercel\.app\/mail\/micro-mike-zoek\.png/);
});

test('confirmation shows the model name and a photo per configuration', async () => {
  const { confirmationMail, pickImages, modelName, mailImage } = await core();
  assert.equal(modelName('Refurbished MacBook Air 13" M2 (2022)'), 'MacBook Air 13" M2 (2022)');
  const img = pickImages(['M2/16GB/512GB', 'M2/24GB/1TB'], [
    { handle: 'macbook-air-13-m2-8gb-256ssd-sg-refurbished-4', image: 'https://cdn.shopify.com/a.jpg' },
    { handle: 'macbook-air-13-m2-16gb-512ssd-sl-refurbished-5', image: 'https://cdn.shopify.com/b.jpg?v=1' },
  ]);
  assert.deepEqual(plain(img), { 'M2/16GB/512GB': 'https://cdn.shopify.com/b.jpg?v=1', 'M2/24GB/1TB': 'https://cdn.shopify.com/a.jpg' });
  assert.equal(mailImage('https://evil.example/x.jpg'), null);
  const m = confirmationMail('nl', 'Olivier', [{ key: 'M2/16GB/512GB', model: 'MacBook Air 13" M2 (2022)', image: img['M2/16GB/512GB'] }], [3, 4, 5], 'https://x.vercel.app/u?t=1&l=nl');
  assert.match(m.html, /MacBook Air 13&quot; M2 \(2022\)/);
  assert.match(m.html, /https:\/\/cdn\.shopify\.com\/b\.jpg\?v=1&amp;width=240/);
  assert.match(m.html, /Gekozen uiterlijk/);
  assert.match(m.html, /<b>Behoorlijk<\/b>/);
  assert.match(m.html, /<b>Als nieuw<\/b>/);
});

test('header band names the wished main category', async () => {
  const { wishBand, confirmationMail } = await core();
  assert.equal(wishBand('refurbished-macbook-air-13-m2', 'nl'), 'Jouw gewenste MacBook');
  assert.equal(wishBand('refurbished-iphone-13', 'fr'), 'Votre iPhone souhaité');
  assert.equal(wishBand('refurbished-apple-watch-series-9', 'fr'), 'Votre Apple Watch souhaitée');
  assert.equal(wishBand('iets-anders', 'en'), 'Your desired device');
  assert.match(confirmationMail('nl', 'O', ['M2/8GB/256GB'], [3], 'https://x.app/u', 'refurbished-macbook-air-13-m2').html, />Jouw gewenste MacBook</);
});

test('names cannot carry links, digits or spam', async () => {
  const { validName, parseRequest } = await core();
  for (const ok of ['Olivier Bernaert', 'Zoë D\'Hondt', 'Jean-Luc', 'Ö. Çelik']) assert.ok(validName(ok), ok);
  for (const bad of ['Win €1000', 'www.spam', 'Jan http', 'jan.com', '<b>', 'a'.repeat(61), '123', 'Jan\nPiet', 'Klik spam.be']) assert.ok(!validName(bad), bad);
  assert.equal(parseRequest({ name: 'Bezoek spam.be', email: 'a@b.be', collection: 'refurbished-macbook-air-13-m2', configs: ['M2/8GB/256GB'], consent: true }).error, 'invalid');
  const route = read('app/api/public/aanvraag/route.ts');
  assert.ok(route.indexOf("claim_shop_stock_confirmation") < route.indexOf('sendShopMail('), 'mail limit checked before sending');
});

test('closed requests are erased after 60 days', () => {
  const run = read('lib/stockRequests/run.ts');
  assert.match(run, /from\('shop_stock_requests'\)\.delete\(\)\.in\('status', \['notified', 'unsubscribed', 'expired'\]\)\.lt\('updated_at', new Date\(Date\.now\(\) - 60 \* 86400_000\)/);
  assert.match(read('security/sql/shop-stock-requests.sql'), /consent_version text not null/);
});

test('iPhone: storage as configuration, requests on iPhone model pages, mails name the iPhone', async () => {
  const { iphoneConfig, deviceConfig, configLabel, parseRequest, matchRequests, availableMail, collectionName } = await core();
  assert.equal(iphoneConfig('iphone-13-128gb-midnight-refurbished-3-m'), '128GB');
  assert.equal(iphoneConfig('iphone-17-pro-max-2tb-deep-blue-refurbished-5'), '2TB');
  assert.equal(iphoneConfig('macbook-air-13-m2-8-gb-256ssd-sg-refurbished-4-m'), '');
  assert.equal(deviceConfig('iphone-16-pro-256gb-white-titanium-refurbished-5-m'), '256GB');
  assert.equal(deviceConfig('macbook-air-13-m2-8-gb-256ssd-sg-refurbished-4-m'), 'M2/8GB/256GB');
  assert.equal(configLabel('128GB', 'nl'), '128 GB opslag');
  assert.equal(configLabel('1TB', 'fr'), '1 To stockage');
  const base = { name: 'Jan Peeters', email: 'jan@example.com', language: 'nl', consent: true, grades: [4, 5] };
  const ok = parseRequest({ ...base, collection: 'refurbished-iphone-16-pro', configs: ['256GB', '1TB'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(plain(ok.value.keys), ['256GB', '1TB']);
  // Soort configuratie moet bij de collectie passen.
  assert.equal(parseRequest({ ...base, collection: 'refurbished-iphone-16-pro', configs: ['M2/16GB/1TB'] }).ok, false);
  assert.equal(parseRequest({ ...base, collection: 'refurbished-macbook-air-13-m2', configs: ['256GB'] }).ok, false);
  assert.equal(parseRequest({ ...base, collection: 'refurbished-iphone', configs: ['256GB'] }).ok, false);
  assert.equal(parseRequest({ ...base, collection: 'refurbished-iphone-16-pro', configs: ['5GB'] }).ok, false);
  // iPhone-modelpagina's met een afwijkende handle.
  assert.equal(parseRequest({ ...base, collection: 'iphone-15-pro', configs: ['256GB'] }).ok, true);
  assert.equal(parseRequest({ ...base, collection: 'refurbisehd-iphone-17', configs: ['M2/16GB/1TB'] }).ok, false);
  assert.equal(parseRequest({ ...base, collection: 'constructor', configs: ['256GB'] }).ok, false);
  assert.equal(collectionName('microforce-iphone-iphone-12'), 'iPhone 12');
  const req = { id: '1', name: 'Jan', email: 'jan@example.com', language: 'nl', collection_handle: 'refurbished-iphone-16-pro', config_key: '256GB', config_label: '', grades: [4, 5], token: 't' };
  const m = matchRequests([req], new Map([['refurbished-iphone-16-pro', [
    { handle: 'iphone-16-pro-128gb-black-titanium-refurbished-5-m', status: 'ACTIVE', totalInventory: 1, price: 869 },
    { handle: 'iphone-16-pro-256gb-white-titanium-refurbished-5-m', status: 'ACTIVE', totalInventory: 1, price: 979 },
    { handle: 'iphone-16-pro-256gb-natural-titanium-refurbished-4-m', status: 'ACTIVE', totalInventory: 2, price: 949 },
  ]]]));
  assert.equal(m.length, 1);
  assert.equal(m[0].product.handle, 'iphone-16-pro-256gb-natural-titanium-refurbished-4-m');
  const mail = availableMail('nl', 'Jan', m, 'https://x.test/u');
  assert.match(mail.subject, /iPhone/);
  assert.doesNotMatch(mail.subject + mail.text, /MacBook/);
  assert.equal(collectionName('refurbished-iphone-16-pro'), 'iPhone 16 Pro');
});
