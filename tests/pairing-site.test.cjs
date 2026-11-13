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

function mockStation() {
  const sockets = [];
  const events = [];
  const creds = { registered: false, noiseKey: {}, signedIdentityKey: {} };
  const transport = {
    useMultiFileAuthState: async () => ({ state: { creds, keys: {} }, saveCreds: async () => {} }),
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    makeCacheableSignalKeyStore: keys => keys,
    default: () => {
      const socket = { ev: new EventEmitter(), requestPairingCode: async () => 'ABCD1234', end() { this.closed = true; } };
      sockets.push(socket);
      queueMicrotask(() => queueMicrotask(() => socket.ev.emit('connection.update', { connection: 'connecting' })));
      return socket;
    },
  };
  const module = { exports: {} };
  const filename = require.resolve('../pairing-site');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, __dirname: path.dirname(filename), process: { env: {} }, Buffer,
    console: { log: line => events.push(line) },
    require: id => id === 'fs' ? { ...fs, existsSync: () => true, promises: {
      readFile: async () => Buffer.from(JSON.stringify(creds)), rm: async () => {},
    } } : id === '@whiskeysockets/baileys' ? transport : id === 'dotenv' ? { config() {} } : require(id),
    setTimeout: (fn, delay) => { if (delay === 4000) { queueMicrotask(fn); return {}; } return setTimeout(fn, delay); },
    clearTimeout, setInterval: () => ({ unref() {} }),
  }, { filename });
  return { ...module.exports, sockets, events, creds };
}

function browserPage() {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const copied = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', style: {} });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element },
    navigator: { clipboard: { writeText: async value => copied.push(value) } },
    fetch: async () => ({ ok: false, json: async () => ({ error: 'WhatsApp closed this pairing request.' }) }),
    setTimeout, clearTimeout, AbortSignal,
  });
  vm.runInContext(script, context);
  vm.runInContext("pairingCode='ABCD1234'; requestToken='browser-token'; polling=true; pollDeadline=Date.now()+60000;", context);
  element('code').textContent = 'ABCD1234';
  return { context, element, copied };
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

test('a closed code connection is reported as unusable instead of pending', async () => {
  const station = mockStation();
  await serve(station.app, async base => {
    const phone = '254700000002';
    const pair = await (await post(base, '/api/pair', { phone })).json();
    assert.ok(pair.expiresAt > Date.now());
    assert.ok(pair.expiresInMs > 0 && pair.expiresInMs <= 10 * 60 * 1000);
    station.sockets[0].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
    const status = await post(base, '/api/status', { phone, requestToken: pair.requestToken });
    assert.equal(status.status, 502);
    assert.match((await status.json()).error, /no longer usable/);
    assert.equal((await post(base, '/api/status', { phone, requestToken: pair.requestToken })).status, 404);
    const logged = station.events.join('\n');
    assert.doesNotMatch(logged, new RegExp(`${phone}|${pair.requestToken}|${pair.code}`));
    assert.match(logged, /connection_closed/);
  });
});

test('requesting a newer code replaces the old browser request explicitly', async () => {
  const station = mockStation();
  await serve(station.app, async base => {
    const phone = '254700000003';
    const first = await (await post(base, '/api/pair', { phone })).json();
    const second = await (await post(base, '/api/pair', { phone })).json();
    assert.equal(station.sockets[0].closed, true);
    const stale = await post(base, '/api/status', { phone, requestToken: first.requestToken });
    assert.equal(stale.status, 403);
    assert.match((await stale.json()).error, /newest code/);
    const current = await post(base, '/api/status', { phone, requestToken: second.requestToken });
    assert.equal(current.status, 200);
    assert.equal((await current.json()).linked, false);
  });
});

test('pairing completion restarts are bounded instead of keeping a broken request forever', async () => {
  const station = mockStation();
  await serve(station.app, async base => {
    const phone = '254700000004';
    const pair = await (await post(base, '/api/pair', { phone })).json();
    for (let i = 0; i < 3; i++) {
      station.sockets.at(-1).ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(station.sockets.length, 3);
    const status = await post(base, '/api/status', { phone, requestToken: pair.requestToken });
    assert.equal(status.status, 502);
    assert.match((await status.json()).error, /could not complete/);
  });
});

test('rapid copy taps always copy the actual code and never overwrite its display', async () => {
  const page = browserPage();
  await vm.runInContext('Promise.all([copyCode(), copyCode()])', page.context);
  assert.deepEqual(page.copied, ['ABCD1234', 'ABCD1234']);
  assert.equal(page.element('code').textContent, 'ABCD1234');
  assert.match(page.element('code-copy-status').textContent, /Code copied/);
});

test('closed or expired browser requests clear the old code and stop copying it', async () => {
  const closed = browserPage();
  await vm.runInContext('pollLink();', closed.context);
  await vm.runInContext('copyCode();', closed.context);
  assert.equal(closed.copied.length, 0);
  assert.equal(closed.element('code').textContent, 'UNAVAILABLE');
  assert.match(closed.element('err2').textContent, /closed/);
  const expired = browserPage();
  await vm.runInContext('pollDeadline=Date.now()-1; copyCode();', expired.context);
  assert.equal(expired.copied.length, 0);
  assert.match(expired.element('err2').textContent, /expired/);
});
