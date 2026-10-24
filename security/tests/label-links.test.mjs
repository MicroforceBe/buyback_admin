import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
const root = new URL('../../', import.meta.url);
const envDefaults = { SENDCLOUD_LABEL_LINK_SECRET: 'synthetic-test-secret-at-least-32-characters', MAIL_PUBLIC_BASE_URL: 'https://admin.example.invalid', SENDCLOUD_PUBLIC_KEY: 'fake-public', SENDCLOUD_SECRET_KEY: 'fake-secret', RESEND_API_KEY: 'fake-not-real', MAIL_FROM: 'test@example.invalid' };
async function harness({ authorized = false, provider, overrides = {} } = {}) {
  const env = { ...envDefaults, ...overrides };
  const calls = { access: 0, fetch: [], mail: [], render: [] };
  const context = vm.createContext({ Buffer, Request, Response, Headers, URL, Date, process: { env }, console: { info() {}, warn() {}, error() {} }, fetch: async (...args) => { calls.fetch.push(args); return provider ? provider(...args) : new Response('%PDF-synthetic-only', { headers: { 'content-type': 'application/pdf' } }); } });
  const cache = new Map();
  function synthetic(key, exports) { if (cache.has(key)) return cache.get(key); const m = new vm.SyntheticModule(Object.keys(exports), function () { for (const [k, v] of Object.entries(exports)) this.setExport(k, v); }, { context }); cache.set(key, m); return m; }
  async function load(path) {
    if (cache.has(path)) return cache.get(path);
    const m = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL(path, root), 'utf8'), { mode: 'strip' }), { context, identifier: path }); cache.set(path, m);
    await m.link(spec => {
      if (spec === 'server-only') return synthetic(spec, {});
      if (spec === 'node:crypto') return synthetic(spec, crypto);
      if (spec === 'next/server') return synthetic(spec, { NextRequest: Request, NextResponse: Response });
      if (spec === '@/lib/security/access') return synthetic(spec, { apiAccess: async () => { calls.access++; return authorized ? null : new Response('Unauthorized', { status: 401 }); } });
      if (spec === 'resend') return synthetic(spec, { Resend: class { emails = { send: async input => { calls.mail.push(input); return { data: { id: 'synthetic-id' }, error: null }; } }; } });
      if (spec === './templates') return synthetic(spec, { renderStatusEmail: async input => { calls.render.push(input); return { subject: 'TEST', html: '<p>TEST</p>' }; } });
      if (spec.startsWith('@/')) return load(spec.slice(2) + '.ts');
      throw Error('Unexpected dependency: ' + spec);
    }); return m;
  }
  const helper = await load('lib/security/labelLinks.ts'); await helper.evaluate();
  const route = await load('app/api/admin/sendcloud/label/route.ts'); await route.evaluate();
  const sender = await load('lib/email/sendStatusUpdateMail.ts'); await sender.evaluate();
  return { helper: helper.namespace, get: route.namespace.GET, send: sender.namespace.sendStatusUpdateMail, calls, env };
}
test('a signed customer link opens only its own PDF without admin login', async () => {
  const h = await harness(); const link = h.helper.createLabelLink('123456'); const response = await h.get(new Request(link));
  assert.equal(response.status, 200); assert.equal(h.calls.access, 0); assert.equal(h.calls.fetch.length, 1); assert.equal(await response.text(), '%PDF-synthetic-only');
  const [url, options] = h.calls.fetch[0]; assert.equal(url, 'https://panel.sendcloud.sc/api/v3/parcels/123456/documents/label'); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});
test('changing parcel ID, expiry or signature denies access before any provider call', async () => {
  for (const [field, value] of [['parcel_id', '123457'], ['expires', String(Math.floor(Date.now()/1000)+3600)], ['signature', 'a'.repeat(43)]]) {
    const h = await harness(); const link = new URL(h.helper.createLabelLink('123456')); link.searchParams.set(field, value); assert.equal((await h.get(new Request(link))).status, 403); assert.equal(h.calls.fetch.length, 0);
  }
});
test('expired links, a rotated secret and partial tokens deny access', async () => {
  const h = await harness(); const old = h.helper.createLabelLink('123456', Date.now()-31*24*60*60*1000); assert.equal((await h.get(new Request(old))).status, 403);
  const current = h.helper.createLabelLink('123456'); h.env.SENDCLOUD_LABEL_LINK_SECRET = 'different-synthetic-test-secret-over-32-characters'; assert.equal((await h.get(new Request(current))).status, 403);
  assert.equal((await h.get(new Request('https://admin.example.invalid/api/admin/sendcloud/label?parcel_id=123456&expires=123'))).status, 403); assert.equal(h.calls.fetch.length, 0);
});
test('an unsigned anonymous request cannot obtain a label', async () => {
  const h = await harness(); assert.equal((await h.get(new Request('https://admin.example.invalid/api/admin/sendcloud/label?parcel_id=123456'))).status, 401); assert.equal(h.calls.fetch.length, 0);
});
test('authorized admins retain unsigned label access but invalid IDs never reach the provider', async () => {
  const h = await harness({ authorized: true }); assert.equal((await h.get(new Request('https://admin.example.invalid/api/admin/sendcloud/label?parcel_id=123456'))).status, 200);
  assert.equal((await h.get(new Request('https://admin.example.invalid/api/admin/sendcloud/label?parcel_id=../other'))).status, 400); assert.equal(h.calls.fetch.length, 1);
});
test('missing signing configuration fails closed and never produces an unsigned mail link', async () => {
  for (const overrides of [{ SENDCLOUD_LABEL_LINK_SECRET: '' }, { SENDCLOUD_LABEL_LINK_SECRET: 'short' }, { MAIL_PUBLIC_BASE_URL: '' }, { MAIL_PUBLIC_BASE_URL: 'http://admin.example.invalid' }]) {
    const h = await harness({ overrides }); assert.throws(() => h.helper.createLabelLink('123456')); await assert.rejects(h.send({ to: 'test@example.invalid', status: 'label_created', label_pdf_url: '123456' })); assert.equal(h.calls.mail.length, 0);
  }
});
test('missing provider keys and provider errors do not leak credentials or response bodies', async () => {
  const h = await harness({ overrides: { SENDCLOUD_SECRET_KEY: '' } }); assert.equal((await h.get(new Request(h.helper.createLabelLink('123456')))).status, 503); assert.equal(h.calls.fetch.length, 0);
  for (const provider of [async()=>new Response('private customer info', { status: 500 }), async()=>new Response('<html>private</html>', { headers: { 'content-type': 'text/html' } }), async()=>{ throw Error('private key'); }]) {
    const x = await harness({ provider }); const response = await x.get(new Request(x.helper.createLabelLink('123456'))); assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('private')); assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});
test('numeric, own-proxy and Sendcloud API references become signed customer links', async () => {
  const h = await harness(); for (const raw of ['123456', 'https://admin.example.invalid/api/admin/sendcloud/label?parcel_id=123456', 'https://panel.sendcloud.sc/api/v3/parcels/123456/documents/label']) {
    const u = new URL(h.helper.normalizeCustomerLabelLink(raw)); assert.equal(u.searchParams.get('parcel_id'), '123456'); assert.equal(h.helper.validLabelLink('123456', u.searchParams.get('expires'), u.searchParams.get('signature')), true);
  }
  assert.equal(h.helper.normalizeCustomerLabelLink('https://downloads.example.invalid/document.pdf?access=synthetic'), 'https://downloads.example.invalid/document.pdf?access=synthetic');
  assert.equal(h.helper.normalizeCustomerLabelLink(undefined), undefined);
});
test('actual status mail rendering receives the signed link and does not make a shipment', async () => {
  const h = await harness(); await h.send({ to: 'test@example.invalid', status: 'label_created', label_pdf_url: '123456', order_code: 'TEST-001' }); const u = new URL(h.calls.render[0].context.label_pdf_url); assert.ok(u.searchParams.get('signature')); assert.equal(h.calls.mail.length, 1); assert.equal(h.calls.fetch.length, 0);
});
