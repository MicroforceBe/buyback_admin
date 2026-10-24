import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';

// Evaluate only real top-level schema declarations. Application imports,
// handlers, database clients, mail and network calls are never executed.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const admin = fs.existsSync(path.join(root, 'app/admin/uploads/actions.ts'));
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const schemas = new Map();
for (const absolute of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]) {
  if (!absolute.endsWith('.ts')) continue;
  const source = fs.readFileSync(absolute, 'utf8');
  if (!/from\s+['"]zod['"]/.test(source)) continue;
  const ast = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true);
  const names = [], declarations = [];
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const items = statement.declarationList.declarations;
    if (!items.some(d => d.initializer && /\bz\s*\./.test(d.initializer.getText(ast)))) continue;
    declarations.push(statement.getText(ast).replace(/^export\s+/, ''));
    for (const d of items) { assert.ok(ts.isIdentifier(d.name)); names.push(d.name.text); }
  }
  const js = ts.transpileModule(declarations.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  const values = vm.runInNewContext(js + '\n;({' + names.join(',') + '})', { z, Date }, { timeout: 1000 });
  for (const [name, schema] of Object.entries(values)) {
    schemas.set(relative + ':' + name, schema);
    test(relative + ': ' + name + ' rejects null with structured issues', () => {
      const result = schema.safeParse(null);
      assert.equal(result.success, false);
      assert.ok(Array.isArray(result.error.issues));
    });
  }
}

const uuid = 'a8fdf29e-d428-4d9d-80f3-674574056e35';
const address = { first_name: 'Test', last_name: 'User', address1: 'Teststraat 1', zip: '1000', city: 'Teststad', country: 'BE' };
const fixtures = admin ? [
  ['app/admin/uploads/actions.ts:FileSchema', { type: 'prices', csv: 'model,price\nTEST,100' }, { type: 'unknown', csv: 'valid text' }],
  ['app/admin/tips/actions.ts:TipRow', { model: 'TEST Device', tip_key: 'pay_bank', tip: 'Test tip' }, { model: '', tip_key: 'pay_bank', tip: 'Test' }],
  ['app/admin/multipliers/actions.ts:MultRow', { model: 'TEST', question_key: 'screen', option_key: 'good', multiplier_value: 0.95, active: true }, { model: 'TEST', question_key: 'screen', option_key: 'good', multiplier_value: '0.95' }]
] : [
  ['lib/schema.ts:priceQuerySchema', { brand: 'TEST', model: 'Device', variant: '128 GB' }, { brand: '', model: 'Device', variant: '128 GB' }],
  ['lib/schema.ts:customerSchema', { email: 'test@example.invalid', address }, { email: 'invalid', address }],
  ['lib/schema.ts:submitSchema', { customer: { email: 'test@example.invalid', address }, device: { brand: 'TEST', model: 'Device', variant: '128 GB', condition: 'good' }, answers: [{ question: 'screen', answer: 'good' }], iban: 'BE00000000000000', deliveryMethod: 'OPZENDEN', priceCents: 10000 }, { priceCents: -1 }],
  ['app/api/buyback/quote/route.ts:BodySchema', { brand: 'TEST', model: 'Device' }, { brand: 'TEST', model: 'Device', answers: [{ question_key: '', answer: 'good' }] }],
  ['app/api/buyback/orders/[id]/route.ts:PatchSchema', { status: 'REGISTERED', notes: 'TEST', paid: false, sendcloudTracking: null }, { status: 'INVENTED_STATUS' }],
  ['app/api/buyback/catalog/models/route.ts:CreateSchema', { categoryId: uuid, name: 'TEST', active: true }, { categoryId: 'bad-id', name: 'TEST' }],
  ['app/api/buyback/catalog/variants/route.ts:CreateSchema', { modelId: uuid, baseCents: 10000 }, { modelId: uuid, baseCents: -1 }],
  ['app/api/buyback/multipliers/sets/route.ts:CreateSchema', { name: 'TEST', scope: 'global', effectiveFrom: '2026-10-24T00:00:00Z' }, { name: '', scope: 'global', effectiveFrom: '2026-10-24T00:00:00Z' }],
  ['app/api/buyback/submit/route.ts:SubmitPayload', { customer: { email: 'test@example.invalid', phone: '00000', address }, device: { brand: 'TEST', category: 'TEST', model: 'Device', variant: '128 GB' }, answers: [{ question_key: 'screen', answer: 'good' }], payment: 'voucher', delivery: { method: 'Binnenbrengen' } }, { customer: { email: 'invalid' } }]
];
for (const [key, valid, invalid] of fixtures) {
  test(key + ' preserves valid input and rejects invalid input', () => {
    const schema = schemas.get(key); assert.ok(schema, 'Actual application schema exists');
    const accepted = schema.safeParse(valid);
    assert.equal(accepted.success, true, accepted.success ? undefined : JSON.stringify(accepted.error.issues));
    assert.equal(schema.safeParse(invalid).success, false);
  });
}
test('quote defaults remain present after validation', { skip: admin }, () => {
  const parsed = schemas.get('app/api/buyback/quote/route.ts:BodySchema').parse({ brand: 'TEST', model: 'Device' });
  assert.equal(parsed.variant, ''); assert.equal(parsed.condition, ''); assert.equal(parsed.answers.length, 0);
});
test('application validation schemas were discovered', () => assert.ok(schemas.size >= (admin ? 3 : 20)));

