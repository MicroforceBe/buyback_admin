import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const ref = 'ekqmhexbabrwudetkfcm';
function buildConfig(env) {
  const module = { exports: {} };
  vm.runInNewContext(read('next.config.js'), { process: { env }, URL, module }, { timeout: 1000 });
  return module.exports;
}

test('test builds accept only the isolated Supabase project and its direct or pooled database', () => {
  for (const database of [
    `postgres://postgres:fixture@db.${ref}.supabase.co:5432/postgres`,
    `postgres://postgres.${ref}:fixture@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
  ]) assert.ok(buildConfig({ SUPABASE_URL: `https://${ref}.supabase.co`, DATABASE_URL: database }));
});

test('test builds refuse production or other Supabase and database targets', () => {
  for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    assert.throws(() => buildConfig({ [name]: 'https://other-project.supabase.co' }), /isolated test project/);
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    for (const value of [
      'postgres://postgres:fixture@db.other-project.supabase.co/postgres',
      'postgres://postgres.other-project:fixture@aws-1-eu-central-1.pooler.supabase.com/postgres',
      `postgres://postgres.${ref}:fixture@unrelated.example.invalid/postgres`,
    ]) assert.throws(() => buildConfig({ [name]: value }), /isolated test project/);
  }
});

test('the fixed test environment retains manual deployment and no integration schedules', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.equal(config.git.deploymentEnabled, false);
  assert.deepEqual(config.crons, []);
});
