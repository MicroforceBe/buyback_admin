import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const fromPrisma = createRequire(require.resolve('prisma/package.json'));
const configPath = fromPrisma.resolve('@prisma/config');
const fromConfig = createRequire(configPath);
const { loadConfigFromFile } = fromPrisma('@prisma/config');
const { deepmerge } = fromConfig('deepmerge-ts');
const fixtureUrl = 'postgresql://synthetic:synthetic@127.0.0.1:1/fixture';

test('CLI and client keep the already-tested Prisma version', () => {
  assert.equal(require('prisma/package.json').version, '6.19.3');
  assert.equal(require('@prisma/client/package.json').version, '6.19.3');
});
test('Prisma config resolves the patched merge dependency', () => {
  const entry = fromConfig.resolve('deepmerge-ts');
  const pkg = JSON.parse(fs.readFileSync(path.resolve(path.dirname(entry), '../package.json'), 'utf8'));
  assert.equal(pkg.version, '8.0.0');
});
test('nested configuration, arrays and function references retain existing merge behavior', () => {
  const callback = () => 1;
  const original = { migrations: { path: 'migrations', seed: 'node seed.js' }, items: ['one'], callback };
  const merged = deepmerge(original, { migrations: { path: 'custom' }, items: ['two'] });
  assert.deepEqual(merged.migrations, { path: 'custom', seed: 'node seed.js' });
  assert.deepEqual(merged.items, ['one', 'two']); assert.equal(merged.callback, callback);
  assert.equal(original.migrations.path, 'migrations'); assert.deepEqual(original.items, ['one']);
});
test('recursive merge input no longer exhausts the stack', () => {
  const left = { a: 1 }, right = { b: 2 }; left.self = left; right.self = right;
  const result = deepmerge(left, right);
  assert.equal(result.a, 1); assert.equal(result.b, 2); assert.equal(result.self, result);
});
async function tempConfig(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'microforce-prisma-test-'));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
test('actual config loader preserves schema, migration path and a synthetic datasource', async t => {
  const dir = await tempConfig(t);
  fs.writeFileSync(path.join(dir, 'prisma.config.ts'), `export default {
    schema: './fixture.prisma', engine: 'classic',
    datasource: { url: '${fixtureUrl}' }, migrations: { path: './migrations' }
  };`);
  const result = await loadConfigFromFile({ configRoot: dir });
  assert.equal(result.error, undefined);
  assert.equal(result.config.schema, path.join(dir, 'fixture.prisma'));
  assert.equal(result.config.migrations.path, path.join(dir, 'migrations'));
  assert.equal(result.config.datasource.url, fixtureUrl);
});
test('actual config loader still supports the application default without a config file', async t => {
  const dir = await tempConfig(t);
  const result = await loadConfigFromFile({ configRoot: dir });
  assert.equal(result.error, undefined); assert.equal(result.resolvedPath, null); assert.ok(result.config);
});
test('generated client keeps application models and instantiates without opening a database connection', async () => {
  const { PrismaClient, Prisma } = require('@prisma/client');
  const names = Prisma.dmmf.datamodel.models.map(m => m.name);
  assert.ok(names.includes('DeviceUnit')); assert.ok(names.includes('DiagnosticSession'));
  const client = new PrismaClient({ datasourceUrl: fixtureUrl });
  try { assert.ok(client.deviceUnit); assert.ok(client.diagnosticSession); }
  finally { await client.$disconnect(); }
});
test('schema remains the original PostgreSQL datasource and generator', () => {
  const source = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  assert.match(source, /provider\s*=\s*"prisma-client-js"/);
  assert.match(source, /provider\s*=\s*"postgresql"/);
  assert.match(source, /url\s*=\s*env\("DATABASE_URL"\)/);
});

