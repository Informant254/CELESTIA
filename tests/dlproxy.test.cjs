const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const settingsStore = require('../utils/settingsStore');
const { createServer } = require('../dlproxy/server');
const fetchMod = require('../dlproxy/fetch');

const KEYS_FILE = path.join(__dirname, '..', 'dlproxy', 'keys.json');

function withCleanKeys(fn) {
  const had = fs.existsSync(KEYS_FILE);
  const backup = had ? fs.readFileSync(KEYS_FILE, 'utf8') : null;
  fs.writeFileSync(KEYS_FILE, '{}');
  return Promise.resolve().then(fn).finally(() => {
    if (backup !== null) fs.writeFileSync(KEYS_FILE, backup);
    else if (fs.existsSync(KEYS_FILE)) fs.unlinkSync(KEYS_FILE);
  });
}

async function listen(app) {
  const srv = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise((r) => srv.close(r)) };
}

function stubFetcher() {
  const prev = fetchMod.fetchMedia;
  fetchMod.setFetcher(async (kind) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlproxy-test-'));
    const file = path.join(dir, kind === 'mp3' ? 't.mp3' : 't.mp4');
    fs.writeFileSync(file, Buffer.from('FAKEBYTES'));
    return { file, dir };
  });
  return () => fetchMod.setFetcher(prev);
}

test('proxy: rejects missing/bad keys, serves bytes to valid keys', async () => {
  await withCleanKeys(async () => {
    const unfetch = stubFetcher();
    const app = createServer({ adminKey: 'adm' });
    const { base, close } = await listen(app);
    try {
      let r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x`);
      assert.equal(r.status, 401);
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x&key=nope`);
      assert.equal(r.status, 401);
      // issue a key via admin
      r = await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey: 'adm', action: 'issue', label: 't', rpm: 5, rpd: 50 }) });
      const issued = await r.json();
      assert.ok(issued.key, 'key issued');
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x&key=${issued.key}`);
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type'), /audio\/mpeg/);
      assert.equal(await r.text(), 'FAKEBYTES');
      // non-youtube rejected
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://example.com/x&key=${issued.key}`);
      assert.equal(r.status, 400);
      // revoke kills it
      r = await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey: 'adm', action: 'revoke', key: issued.key }) });
      assert.equal((await r.json()).success, true);
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x&key=${issued.key}`);
      assert.equal(r.status, 401);
      // bad admin rejected
      r = await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey: 'wrong', action: 'list' }) });
      assert.equal(r.status, 403);
    } finally {
      await close();
      unfetch();
    }
  });
});

test('proxy: per-minute quota enforced', async () => {
  await withCleanKeys(async () => {
    const unfetch = stubFetcher();
    const app = createServer({ adminKey: 'adm' });
    const { base, close } = await listen(app);
    try {
      let r = await fetch(`${base}/admin/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminKey: 'adm', action: 'issue', label: 'q', rpm: 1, rpd: 50 }) });
      const { key } = await r.json();
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x&key=${key}`);
      assert.equal(r.status, 200);
      await r.arrayBuffer();
      r = await fetch(`${base}/api/download/youtube/mp3?url=https://www.youtube.com/watch?v=x&key=${key}`);
      assert.equal(r.status, 429);
    } finally {
      await close();
      unfetch();
    }
  });
});

test('client: skips silently when unconfigured, hits own proxy when set', async () => {
  const prevUrl = settingsStore.get('dlproxy_url', undefined);
  const prevKey = settingsStore.get('dlproxy_key', undefined);
  const axiosPath = require.resolve('axios');
  const origAxios = require.cache[axiosPath]?.exports;
  const seen = [];
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: async (url, opts) => { const q = new URLSearchParams(opts?.params || {}).toString(); seen.push(url + (q ? '?' + q : '')); return { status: 200, headers: { 'content-type': 'audio/mpeg' }, data: Buffer.from('PROXYBYTES') }; } },
  };
  delete require.cache[require.resolve('../utils/dlproxy')];
  try {
    const client = require('../utils/dlproxy');
    assert.equal(client.configured(), false, 'unconfigured by default');
    await assert.rejects(() => client.dlproxyAudio('https://www.youtube.com/watch?v=x'), /no dlproxy/);
    settingsStore.set('dlproxy_url', 'https://dl.example.com/');
    settingsStore.set('dlproxy_key', 'k123');
    delete require.cache[require.resolve('../utils/dlproxy')];
    const client2 = require('../utils/dlproxy');
    assert.equal(client2.configured(), true);
    const r = await client2.dlproxyAudio('https://www.youtube.com/watch?v=x');
    assert.equal(r.buf.toString(), 'PROXYBYTES');
    assert.match(seen[0], /dl\.example\.com\/api\/download\/youtube\/mp3/);
    assert.match(seen[0], /key=k123/);
  } finally {
    if (origAxios === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = origAxios;
    delete require.cache[require.resolve('../utils/dlproxy')];
    if (prevUrl === undefined) settingsStore.set('dlproxy_url', null);
    else settingsStore.set('dlproxy_url', prevUrl);
    if (prevKey === undefined) settingsStore.set('dlproxy_key', null);
    else settingsStore.set('dlproxy_key', prevKey);
  }
});

test('fallback: own proxy wins before apix when both answer', async () => {
  const ytdlpPath = require.resolve('../download/ytdlp');
  const ffmpegPath = require.resolve('../download/ffmpeg');
  const apiPath = require.resolve('../utils/downloader');
  const selfPath = require.resolve('../utils/dlproxy');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([ytdlpPath, ffmpegPath, apiPath, selfPath, fallbackPath].map((p) => [p, require.cache[p]]));
  let apixCalls = 0;
  require.cache[ytdlpPath] = { id: ytdlpPath, filename: ytdlpPath, loaded: true, exports: { attempt: async () => { throw new Error('should not run'); } } };
  require.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: { streams: async () => [{ codec_type: 'audio' }], probe: async () => ({}) } };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: { apixAudio: async () => { apixCalls++; throw new Error('should not run'); } } };
  require.cache[selfPath] = { id: selfPath, filename: selfPath, loaded: true, exports: { dlproxyAudio: async () => ({ buf: Buffer.from('SELF'), title: 't' }), dlproxyVideo: async () => { throw new Error('no'); } } };
  const fss = require('node:fs');
  const exists = fss.existsSync;
  const stat = fss.statSync;
  const writeFile = fss.writeFileSync;
  fss.existsSync = (p) => String(p).endsWith('out.mp3') || exists(p);
  fss.statSync = (p) => String(p).endsWith('out.mp3') ? { size: 4 } : stat(p);
  fss.writeFileSync = () => {};
  delete require.cache[fallbackPath];
  try {
    const fallback = require('../download/fallback');
    const result = await fallback.downloadWithFallback({ url: 'https://youtube.com/watch?v=x', title: 'T', isAudio: true, workDir: '/tmp', maxBytes: 100 });
    assert.equal(result.strategy, 'dlproxy');
    assert.equal(apixCalls, 0, 'apix never attempted');
  } finally {
    fss.existsSync = exists;
    fss.statSync = stat;
    fss.writeFileSync = writeFile;
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
  }
});
