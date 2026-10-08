const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { app } = require('../pairing-site');

async function serve(application, run) {
  const server = application.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(base, route, body) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('pairing page works under the HTTPS proxy and exposes the station health', async () => {
  await serve(app, async (base) => {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const html = await page.text();
    assert.match(html, /CELESTIA — Pairing Station/);
    assert.match(html, /fetch\('\.\/api\/pair'/);
    assert.match(html, /fetch\('\.\/api\/status'/);
    assert.match(html, /phone: pairingPhone, requestToken/);
    assert.match(html, /Download session ID/);
    assert.match(html, /id="music-toggle"[^>]*aria-pressed="false"/);
    const music = await fetch(`${base}/music.js`);
    assert.equal(music.status, 200);
    const musicScript = await music.text();
    assert.doesNotThrow(() => new vm.Script(musicScript));
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { ok: true, service: 'celestia-pairing' });
  });
});

test('invalid pairing requests fail without contacting WhatsApp', async () => {
  await serve(app, async (base) => {
    const invalid = await post(base, '/api/pair', { phone: '123' });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Invalid number/);
    const missing = await post(base, '/api/status', { phone: '254700000001' });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
  });
});

test('linked session export requires its token, reconnects on 515 and disposes before handoff', async () => {
  const sockets = [];
  const creds = { registered: false, noiseKey: {}, signedIdentityKey: {} };
  let removed = false;
  const transport = {
    useMultiFileAuthState: async () => ({ state: { creds, keys: {} }, saveCreds: async () => {} }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    makeCacheableSignalKeyStore: (keys) => keys,
    default: () => {
      const socket = {
        ev: new EventEmitter(),
        requestPairingCode: async () => '12345678',
        end: () => { socket.closed = true; },
      };
      sockets.push(socket);
      queueMicrotask(() => queueMicrotask(() => socket.ev.emit('connection.update', { connection: 'connecting' })));
      return socket;
    },
  };
  const fakeFs = {
    ...fs,
    existsSync: () => true,
    promises: {
      readFile: async () => Buffer.from(JSON.stringify(creds)),
      rm: async () => { removed = true; },
    },
  };
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../pairing-site'), 'utf8'), {
    module: moduleStub,
    __dirname: path.dirname(require.resolve('../pairing-site')),
    process: { env: {} },
    Buffer,
    console,
    require: (name) => name === 'fs' ? fakeFs
      : name === '@whiskeysockets/baileys' ? transport
        : name === 'dotenv' ? { config: () => {} } : require(name),
    setTimeout: (fn, delay) => {
      if (delay === 4000) { queueMicrotask(fn); return {}; }
      return setTimeout(fn, delay);
    },
    clearTimeout,
    setInterval: () => ({ unref: () => {} }),
  });

  await serve(moduleStub.exports.app, async (base) => {
    const phone = '254700000001';
    const pair = await post(base, '/api/pair', { phone });
    assert.equal(pair.status, 200);
    const { code, requestToken } = await pair.json();
    assert.equal(code, '12345678');
    assert.ok(requestToken);

    const denied = await post(base, '/api/status', { phone, requestToken: 'wrong' });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).sessionString, undefined);
    const waiting = await post(base, '/api/status', { phone, requestToken });
    assert.equal((await waiting.json()).linked, false);

    creds.registered = true;
    sockets[0].ev.emit('creds.update');
    sockets[0].ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 515 } } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sockets.length, 2);
    sockets[1].ev.emit('connection.update', { connection: 'open' });
    await new Promise((resolve) => setImmediate(resolve));

    const result = await post(base, '/api/status', { phone, requestToken });
    assert.equal(result.status, 200);
    const exported = await result.json();
    assert.equal(exported.linked, true);
    assert.match(exported.sessionString, /^CELESTIA:~/);
    assert.equal(JSON.parse(Buffer.from(exported.sessionString.slice('CELESTIA:~'.length), 'base64')).registered, true);
    assert.equal(sockets[1].closed, true);
    assert.equal(removed, true);
    const consumed = await post(base, '/api/status', { phone, requestToken });
    assert.equal(consumed.status, 404);
  });
});
