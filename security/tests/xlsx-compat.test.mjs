import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as XLSX from 'xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'lib/erpSync.ts'), 'utf8');
const ast = ts.createSourceFile('erpSync.ts', source, ts.ScriptTarget.Latest, true);
const names = ['toNumber', 'toBool', 'normalizeSku', 'parseRows', 'rowToPayload'];
const declarations = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.includes(s.name?.text));
assert.equal(declarations.length, names.length, 'Use the real ERP parser and conversion helpers');
const code = ts.transpileModule(declarations.map(s => s.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
// Only pure helpers are evaluated. FTP, database, full sync and configuration
// functions are never loaded. All workbooks are synthetic in-memory buffers.
const { parseRows, rowToPayload } = vm.runInNewContext(code + '\n;({parseRows,rowToPayload})', { XLSX, Buffer, Date }, { timeout: 1000 });
const headers = ['Variant SKU [ID]', 'Title', 'Variant Price', 'Variant Compare At Price', 'Status', 'Published', 'Metafield: custom.refurbished_product', 'Metafield: custom.vat_margin', 'Variant Inventory Qty', 'Inventory Available: Microforce Gentbrugge', 'Inventory Available: Microforce Oudenaarde', 'Inventory Available: Microforce Antwerpen'];
function workbook(rows, extraRows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'ERP');
  if (extraRows) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, ...extraRows]), 'Ignored');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

test('actual ERP parser preserves exact headers, SKU strings, price cents and store quantities', () => {
  const rows = parseRows(workbook([['001-TEST', 'TEST Device', '100,50', 125, 'active', 'TRUE', 'ja', 'false', 3, 1, 0, 2]]));
  assert.equal(rows.length, 1); assert.equal(rows[0]['Variant SKU [ID]'], '001-TEST');
  const p = rowToPayload(rows[0]);
  assert.equal(p.sku, '001-TEST'); assert.equal(p.price_cents, 10050); assert.equal(p.compare_price_cents, 12500);
  assert.equal(p.inventory_qty, 3); assert.equal(p.stock_gentbrugge, 1); assert.equal(p.stock_oudenaarde, 0); assert.equal(p.stock_antwerpen, 2);
  assert.equal(p.active, true); assert.equal(p.published, true); assert.equal(p.refurbished_product, true); assert.equal(p.vat_margin, false);
});
test('empty optional cells retain safe defaults and no comparison price', () => {
  const [row] = parseRows(workbook([['TEST-EMPTY', 'TEST Device']]));
  const p = rowToPayload(row);
  assert.equal(row['Variant Price'], ''); assert.equal(p.price_cents, 0); assert.equal(p.compare_price_cents, null);
  assert.equal(p.inventory_qty, 0); assert.equal(p.active, false); assert.equal(p.published, false);
  assert.equal(p.missing_from_erp, false); assert.equal(p.missing_from_erp_at, null);
  assert.ok(Number.isFinite(Date.parse(p.updated_at)));
});
test('blank SKU is skipped and surrounding SKU whitespace is removed', () => {
  const rows = parseRows(workbook([['   ', 'SKIP'], ['  TEST-TRIM  ', 'KEEP']]));
  assert.equal(rowToPayload(rows[0]), null); assert.equal(rowToPayload(rows[1]).sku, 'TEST-TRIM');
});
test('Unicode names, boolean text and decimal quantity rounding retain their behavior', () => {
  const [row] = parseRows(workbook([['TEST-UNICODE', '  TEST Téléphone – modèle é  ', '3,33', 0, ' ACTIVE ', ' yes ', '1', 'ja', '2,6', '1,5', '', '0']]));
  const p = rowToPayload(row);
  assert.equal(p.title, 'TEST Téléphone – modèle é'); assert.equal(p.price_cents, 333); assert.equal(p.compare_price_cents, null);
  assert.equal(p.inventory_qty, 3); assert.equal(p.stock_gentbrugge, 2);
  assert.equal(p.active, true); assert.equal(p.published, true); assert.equal(p.refurbished_product, true); assert.equal(p.vat_margin, true);
});
test('ERP parser still uses only the first worksheet', () => {
  const rows = parseRows(workbook([['TEST-FIRST']], [['TEST-SECOND']]));
  assert.equal(rows.length, 1); assert.equal(rows[0]['Variant SKU [ID]'], 'TEST-FIRST');
});
test('a header-only workbook yields no import rows', () => assert.equal(parseRows(workbook([])).length, 0));
test('a truncated ZIP workbook fails rather than becoming successful ERP rows', { timeout: 1000 }, () => {
  assert.throws(() => parseRows(Buffer.from([0x50, 0x4b, 0x03, 0x04])));
});
test('patched SheetJS version comes from the documented vendor URL with locked integrity', () => {
  assert.equal(XLSX.version, '0.20.3');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const pkg = lock.packages['node_modules/xlsx'];
  assert.equal(pkg.version, '0.20.3');
  assert.equal(pkg.resolved, 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz');
  assert.match(pkg.integrity, /^sha512-/);
});

