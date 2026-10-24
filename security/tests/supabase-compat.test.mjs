import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://synthetic.example.invalid';
const key = 'synthetic-service-key';
const id = 'a8fdf29e-d428-4d9d-80f3-674574056e35';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('SKU description filters remain separate AND conditions with database pagination', async () => {
  let requested;
  const client = createClient(origin, key, { global: { fetch: async (input, init) => {
    requested = new URL(new Request(input, init).url);
    assert.equal(requested.origin, origin);
    return json([]);
  } } });
  await client.from('erp_articles').select('sku,title').eq('missing_from_erp', false)
    .not('title', 'ilike', '%air%').ilike('title', '%iPad%').ilike('title', '%2025%')
    .order('sku', { ascending: true }).range(500, 999);
  assert.deepEqual(requested.searchParams.getAll('title'), ['not.ilike.%air%', 'ilike.%iPad%', 'ilike.%2025%']);
  assert.equal(requested.searchParams.get('offset'), '500');
  assert.equal(requested.searchParams.get('limit'), '500');
  assert.equal(requested.searchParams.has('vat_margin'), false);
  assert.equal(requested.searchParams.has('refurbished_product'), false);
});
function harness({ server = false, env = {}, handler = () => json([]) } = {}) {
  const calls = [], clients = [], state = { cookieReads: 0, cookieWrites: 0 };
  const module = { exports: {} };
  const fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(new URL(request.url).origin, origin, 'Never contact an actual Supabase endpoint');
    calls.push(request); return handler(request);
  };
  const inject = factory => (url, apiKey, options = {}) => {
    assert.equal(url, origin);
    const client = factory(url, apiKey, { ...options, global: { ...options.global, fetch } });
    clients.push(client); return client;
  };
  const store = {
    get() { state.cookieReads++; return undefined; },
    set() { state.cookieWrites++; throw Error('Cookie write during render'); }
  };
  const context = {
    module, exports: module.exports,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anon-key', SUPABASE_SERVICE_ROLE_KEY: key, ...env } },
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@supabase/supabase-js') return { createClient: inject(createClient) };
      if (name === '@supabase/ssr') return { createServerClient: inject(createServerClient) };
      if (name === 'next/headers') return { cookies: async () => store };
      throw Error('Unexpected import: ' + name);
    }
  };
  const file = server ? 'lib/supabaseServer.ts' : 'lib/supabaseAdmin.ts';
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, context, { timeout: 1000 });
  return { exports: module.exports, calls, state, clients };
}

test('actual admin helper preserves session lookup and service authorization headers', async () => {
  const h = harness({ handler: () => json([{ user_email: 'test@example.invalid', expires_at: '2026-12-01T00:00:00Z' }]) });
  const result = await h.exports.supabaseAdmin.from('buyback_admin_sessions').select('user_email,expires_at').eq('session_token', 'synthetic-token').maybeSingle();
  assert.equal(result.error, null); assert.equal(result.data.user_email, 'test@example.invalid');
  const req = h.calls[0], url = new URL(req.url);
  assert.equal(url.pathname, '/rest/v1/buyback_admin_sessions'); assert.equal(url.searchParams.get('session_token'), 'eq.synthetic-token');
  assert.equal(req.headers.get('apikey'), key); assert.equal(req.headers.get('authorization'), 'Bearer ' + key);
});
test('an absent session remains a null result without an error', async () => {
  const h = harness();
  const result = await h.exports.supabaseAdmin.from('buyback_admin_sessions').select('user_email').eq('session_token', 'missing').maybeSingle();
  assert.equal(result.data, null); assert.equal(result.error, null);
});
test('receipt update preserves filters, JSON payload and returned row', async () => {
  const h = harness({ handler: () => json({ id, description: 'TEST Device' }) });
  const result = await h.exports.supabaseAdmin.from('refurb_reception_items').update({ description: 'TEST Device' }).eq('id', id).select('id,description').single();
  assert.equal(result.error, null); assert.equal(result.data.description, 'TEST Device');
  const req = h.calls[0]; assert.equal(req.method, 'PATCH'); assert.equal(new URL(req.url).searchParams.get('id'), 'eq.' + id);
  assert.deepEqual(await req.json(), { description: 'TEST Device' });
});
test('secure reception RPC retains its function name and argument', async () => {
  const h = harness({ handler: () => json({ ok: true }) });
  const result = await h.exports.supabaseAdmin.rpc('delete_refurb_reception_secure', { p_id: id });
  assert.equal(result.error, null); const req = h.calls[0];
  assert.equal(new URL(req.url).pathname, '/rest/v1/rpc/delete_refurb_reception_secure'); assert.equal(req.method, 'POST');
  assert.deepEqual(await req.json(), { p_id: id });
});
test('database failures still expose an error code without successful data', async () => {
  const h = harness({ handler: () => json({ code: '23505', message: 'Synthetic conflict', details: null, hint: null }, 409) });
  const result = await h.exports.supabaseAdmin.from('refurb_reception_items').insert({ id });
  assert.equal(result.data, null); assert.equal(result.error.code, '23505');
});
test('actual server helper supports async cookies and never writes cookies while reading tips', async () => {
  const h = harness({ server: true, handler: () => json([{ model: 'TEST Device', tip: 'TEST' }]) });
  const client = await h.exports.supabaseServer();
  const result = await client.from('buyback_ui_tips').select('model,tip').eq('model', 'TEST Device');
  assert.equal(result.error, null); assert.equal(result.data[0].tip, 'TEST');
  assert.ok(h.state.cookieReads > 0); assert.equal(h.state.cookieWrites, 0);
});
test('missing admin connection settings still fail before any request', () => {
  assert.throws(() => harness({ env: { NEXT_PUBLIC_SUPABASE_URL: '' } }), /Missing NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => harness({ env: { SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_SERVICE_ROLE: '' } }), /Missing SUPABASE service role key/);
});
test('invalid auth-admin user identifiers are rejected before constructing a remote path', async () => {
  const h = harness(); let error;
  try { error = (await h.exports.supabaseAdmin.auth.admin.getUserById('../../logout')).error; }
  catch (caught) { error = caught; }
  assert.ok(error); assert.equal(h.calls.length, 0);
});
test('patched SSR cookie dependency preserves session attributes and rejects injected fields', () => {
  const require = createRequire(import.meta.url), fromSsr = createRequire(require.resolve('@supabase/ssr'));
  const { serialize } = fromSsr('cookie');
  const value = serialize('bb_admin_session', 'synthetic-token', { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
  assert.match(value, /HttpOnly/); assert.match(value, /Secure/); assert.match(value, /SameSite=Lax/);
  assert.throws(() => serialize('name;Injected=1', 'value'));
  assert.throws(() => serialize('name', 'value', { path: '/;Injected=1' }));
  assert.throws(() => serialize('name', 'value', { domain: 'example.invalid;Injected=1' }));
});
test('installed production dependencies contain only the pinned patched Supabase packages', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/@supabase/supabase-js'].version, '2.118.0');
  assert.equal(lock.packages['node_modules/@supabase/ssr'].version, '0.5.2');
  for (const [name, pkg] of Object.entries(lock.packages)) {
    if (name.endsWith('node_modules/@supabase/auth-js')) assert.ok(Number(pkg.version.split('.')[1]) >= 70);
    if (name.endsWith('node_modules/cookie')) {
      const [major, minor] = pkg.version.split('.').map(Number); assert.ok(major >= 1 || minor >= 7);
    }
  }
});


