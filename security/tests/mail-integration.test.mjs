import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const root = new URL('../../', import.meta.url);
async function load(file, { env = {}, response = { data: { id: 'synthetic-id' }, error: null }, failAccess = false, providerThrows = false } = {}) {
  const calls = { provider: [], render: [], access: 0, confirmation: [], status: [] };
  const context = vm.createContext({ process: { env }, console: { info() {}, warn() {}, error() {} }, URL, Error });
  const moduleFor = async exports => {
    const m = new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    await m.link(() => { throw Error('Unexpected nested import'); }); await m.evaluate(); return m;
  };
  const m = new vm.SourceTextModule(stripTypeScriptTypes(fs.readFileSync(new URL(file, root), 'utf8'), { mode: 'strip' }), {
    context,
    importModuleDynamically: async spec => {
      if (spec === '@/app/api/buyback/email/sendStatusMail') return moduleFor({ sendStatusMail: async input => { calls.confirmation.push(input); return response; } });
      if (spec === '@/lib/email/sendStatusUpdateMail') return moduleFor({ sendStatusUpdateMail: async input => { calls.status.push(input); return response.error ? undefined : { id: 'synthetic-id' }; } });
      throw Error('Unexpected dynamic import');
    },
  });
  await m.link(spec => {
    if (spec === 'server-only') return moduleFor({});
    if (spec === '@/lib/security/access') return moduleFor({ requireAccess: async (...args) => { calls.access++; assert.equal(args.join(','), 'leads,write,true'); if (failAccess) throw Error('denied'); } });
    if (spec === 'resend') return moduleFor({ Resend: class { emails = { send: async payload => { calls.provider.push(payload); if (providerThrows) throw Error('secret provider detail'); return response; } }; } });
    if (spec === './templates') return moduleFor({ renderStatusEmail: async input => { calls.render.push(input); return { subject: 'TEST status', html: '<p>TEST</p>' }; } });
    throw Error('Unexpected static import: ' + spec);
  });
  await m.evaluate(); return { exports: m.namespace, calls };
}
const senderEnv = { RESEND_API_KEY: 'fake-not-a-key', MAIL_FROM: 'TEST <sender@example.invalid>' };
const testEnv = { ...senderEnv, SUPABASE_URL: 'https://ekqmhexbabrwudetkfcm.supabase.co', NEXT_PUBLIC_SUPABASE_URL: 'https://ekqmhexbabrwudetkfcm.supabase.co' };
const input = { to: 'olivier@microforce.be', status: 'received_store', first_name: 'TEST', order_code: 'TEST-001', model: 'TEST Device' };
test('status sender reports only a provider-accepted message as success', async () => {
  const h = await load('lib/email/sendStatusUpdateMail.ts', { env: senderEnv });
  assert.equal((await h.exports.sendStatusUpdateMail(input)).id, 'synthetic-id'); assert.equal(h.calls.provider[0].to, input.to); assert.equal(h.calls.render[0].status, input.status);
});
test('status sender surfaces a returned provider error instead of false success', async () => {
  const h = await load('lib/email/sendStatusUpdateMail.ts', { env: senderEnv, response: { data: null, error: { message: 'private provider detail' } } });
  await assert.rejects(h.exports.sendStatusUpdateMail(input), /Statusmail kon niet verstuurd/);
});
test('status sender surfaces transport errors without raw provider details', async () => {
  const h = await load('lib/email/sendStatusUpdateMail.ts', { env: senderEnv, providerThrows: true });
  await assert.rejects(h.exports.sendStatusUpdateMail(input), e => !e.message.includes('secret') && e.message.includes('Statusmail'));
});
test('missing provider key cannot be reported as a successful send', async () => {
  const h = await load('lib/email/sendStatusUpdateMail.ts'); await assert.rejects(h.exports.sendStatusUpdateMail(input), /niet ingesteld/); assert.equal(h.calls.provider.length, 0);
});
test('probe denies missing permission before loading mail senders', async () => {
  const h = await load('lib/security/mailProbe.ts', { env: testEnv, failAccess: true }); await assert.rejects(h.exports.sendIntegrationTestMail('confirmation'), /denied/); assert.equal(h.calls.confirmation.length, 0);
});
test('probe refuses other databases, missing configuration and invalid mail kinds', async () => {
  for (const env of [{ ...testEnv, SUPABASE_URL: 'https://other.example.invalid' }, { ...testEnv, NEXT_PUBLIC_SUPABASE_URL: undefined }, { ...testEnv, RESEND_API_KEY: '' }]) {
    const h = await load('lib/security/mailProbe.ts', { env }); await assert.rejects(h.exports.sendIntegrationTestMail('confirmation')); assert.equal(h.calls.confirmation.length, 0);
  }
  const h = await load('lib/security/mailProbe.ts', { env: testEnv }); await assert.rejects(h.exports.sendIntegrationTestMail('arbitrary')); assert.equal(h.calls.confirmation.length, 0);
});
test('both probe messages use the exact authorized recipient and synthetic content', async () => {
  const h = await load('lib/security/mailProbe.ts', { env: testEnv }); await h.exports.sendIntegrationTestMail('confirmation'); await h.exports.sendIntegrationTestMail('status');
  for (const message of [...h.calls.confirmation, ...h.calls.status]) { assert.equal(message.to, 'olivier@microforce.be'); assert.equal(message.model, 'TEST Device'); assert.ok(message.order_code.startsWith('TEST-MAIL-')); assert.equal(message.delivery_method, 'dropoff'); }
  assert.equal(h.calls.confirmation.length, 1); assert.equal(h.calls.status.length, 1);
});
test('probe refuses skipped or rejected confirmation and rejected status', async () => {
  for (const response of [{ skipped: true }, { data: null, error: {} }]) { const h = await load('lib/security/mailProbe.ts', { env: testEnv, response }); await assert.rejects(h.exports.sendIntegrationTestMail('confirmation')); }
  const h = await load('lib/security/mailProbe.ts', { env: testEnv, response: { error: {} } }); await assert.rejects(h.exports.sendIntegrationTestMail('status'));
});
