import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import net from 'node:net';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { Client } from 'basic-ftp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'lib/erpSync.ts'), 'utf8');
const ast = ts.createSourceFile('erpSync.ts', source, ts.ScriptTarget.Latest, true);
const declaration = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'downloadErpXlsx');
assert.ok(declaration, 'Actual application download helper must exist');
const code = ts.transpileModule(declaration.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;

// Real FTP client and real download helper, with synthetic bytes and a server
// bound exclusively to loopback. ERP settings, Supabase and XLSX parsing are
// never loaded. The client guard prevents a test reaching another host.
async function fixture(t, options = {}) {
  const sockets = new Set(), servers = [], commands = [], clients = [];
  const payload = Buffer.from([0x50, 0x4b, 0x00, 0xff, 0x01]);
  const listen = server => new Promise((resolve, reject) => {
    servers.push(server); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(server.address().port); });
  });
  const track = socket => {
    sockets.add(socket); socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket)); return socket;
  };
  const control = net.createServer(raw => {
    const socket = track(raw); let input = '', queue = Promise.resolve(), dataReady;
    socket.write('220 Local synthetic FTP fixture\r\n');
    async function handle(line) {
      const space = line.indexOf(' '), verb = (space < 0 ? line : line.slice(0, space)).toUpperCase();
      commands.push(verb);
      if (verb === 'USER') return socket.write('331 Password required\r\n');
      if (verb === 'PASS') return socket.write(options.denyLogin ? '530 Login denied\r\n' : '230 Logged in\r\n');
      if (verb === 'FEAT') return socket.write('211-Features\r\n UTF8\r\n EPSV\r\n211 End\r\n');
      if (verb === 'PWD') return socket.write('257 "/"\r\n');
      if (verb === 'SIZE') return socket.write('213 ' + payload.length + '\r\n');
      if (verb === 'EPSV') {
        const dataServer = net.createServer();
        dataReady = new Promise(resolve => dataServer.once('connection', s => resolve(track(s))));
        const port = await listen(dataServer);
        return socket.write('229 Entering Extended Passive Mode (|||' + port + '|)\r\n');
      }
      if (verb === 'RETR') {
        const data = await dataReady;
        if (options.denyDownload) { data.destroy(); return socket.write('550 File unavailable\r\n'); }
        socket.write('150 Opening data connection\r\n');
        data.end(payload, () => socket.write('226 Transfer complete\r\n'));
        return;
      }
      if (verb === 'QUIT') return socket.end('221 Goodbye\r\n');
      if (['OPTS', 'TYPE', 'STRU', 'MODE', 'NOOP'].includes(verb)) return socket.write('200 OK\r\n');
      socket.write('502 Unsupported fixture command\r\n');
    }
    socket.on('data', chunk => {
      input += chunk.toString('utf8');
      while (input.includes('\r\n')) {
        const end = input.indexOf('\r\n'), line = input.slice(0, end); input = input.slice(end + 2);
        queue = queue.then(() => handle(line)).catch(() => socket.destroy());
      }
    });
  });
  t.after(async () => {
    for (const c of clients) c.close();
    for (const s of sockets) s.destroy();
    await Promise.all(servers.map(s => new Promise(resolve => s.close(() => resolve()))));
  });
  const port = await listen(control);
  class LocalClient extends Client {
    constructor(timeout) { assert.equal(timeout, 30000); super(2000); clients.push(this); }
    access(settings) {
      assert.equal(settings.host, '127.0.0.1'); assert.equal(settings.port, port);
      assert.equal(settings.secure, false); return super.access(settings);
    }
  }
  const download = vm.runInNewContext(code + '\n;downloadErpXlsx', { Client: LocalClient, Writable, Buffer }, { timeout: 1000 });
  const settings = { ftp_host: 'ftp://127.0.0.1', ftp_port: port, ftp_user: 'synthetic-user', ftp_password: 'synthetic-password', ftp_directory: '/fixture', ftp_filename: 'test.xlsx', ftp_secure: false };
  return { download, settings, payload, clients, commands };
}

test('actual ERP helper downloads identical binary bytes and closes the real FTP client', { timeout: 10000 }, async t => {
  const f = await fixture(t); const result = await f.download(f.settings);
  assert.deepEqual(result.buffer, f.payload); assert.equal(result.remotePath, 'fixture/test.xlsx');
  assert.equal(f.clients[0].closed, true); assert.ok(f.commands.includes('RETR'));
});
test('authentication failure closes the client before returning an error', { timeout: 10000 }, async t => {
  const f = await fixture(t, { denyLogin: true });
  await assert.rejects(() => f.download(f.settings), /530/);
  assert.equal(f.clients[0].closed, true); assert.equal(f.commands.includes('RETR'), false);
});
test('download failure closes the client and does not return partial success', { timeout: 10000 }, async t => {
  const f = await fixture(t, { denyDownload: true });
  await assert.rejects(() => f.download(f.settings)); assert.equal(f.clients[0].closed, true);
});
test('a password containing a command separator cannot inject a second FTP command', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.download({ ...f.settings, ftp_password: 'synthetic-secret\r\nDELE fixture' }));
  assert.equal(f.commands.includes('DELE'), false); assert.equal(f.clients[0].closed, true);
});

