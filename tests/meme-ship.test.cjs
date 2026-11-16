const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, mocks = {}, fetchImpl) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : native(id),
    process: { env: {} }, fetch: fetchImpl, Buffer, URL, URLSearchParams, AbortSignal, AbortController,
    setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}

function jpegLike() { return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]); }

test('meme downloads a keyless image and edits the progress message', async () => {
  const sent = [];
  const meme = load('../commands/meme.js', {
    '../utils/downloader': { downloadBuffer: async url => {
      assert.equal(url, 'https://cdn/image.png');
      return jpegLike();
    }, detectMediaType: () => 'image' },
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  }, async () => ({
    ok: true,
    json: async () => ({ title: 'Funny', url: 'https://cdn/image.png', postLink: 'https://reddit/x', subreddit: 'memes' }),
  }));
  await meme.execute(
    { sendMessage: async (jid, content) => { sent.push(content); return { key: 'progress' }; } },
    { key: { remoteJid: 'chat' } }, [],
  );
  const image = sent.find(m => m.image);
  assert.ok(image, 'an image message should be sent');
  assert.match(image.caption, /Funny/);
  assert.match(image.caption, /r\/memes/);
  assert.ok(sent.some(m => m.text === '✅ Done!' && m.edit));
});

test('meme handles subreddit input, video memes, and provider failures', async () => {
  const sent = [];
  const meme = load('../commands/meme.js', {
    '../utils/downloader': { downloadBuffer: async () => Buffer.from('000000006674797000000000', 'hex'), detectMediaType: () => 'video' },
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  }, async url => {
    assert.match(url, /meme-api\.com\/gimme\/dankmemes\/1$/);
    return { ok: true, json: async () => ({ memes: [{ title: 'Clip', url: 'https://cdn/clip.mp4', subreddit: 'dankmemes' }] }) };
  });
  await meme.execute(
    { sendMessage: async (jid, content) => { sent.push(content); return { key: 'progress' }; } },
    { key: { remoteJid: 'chat' } }, ['r/dankmemes'],
  );
  const video = sent.find(m => m.video);
  assert.ok(video, 'a video message should be sent');
  assert.match(video.caption, /Clip/);
});

test('meme rejects bad subreddit names and reports provider failures politely', async () => {
  const sent = [];
  const meme = load('../commands/meme.js', { '../utils/downloader': {} }, undefined);
  await meme.execute(
    { sendMessage: async (jid, content) => { sent.push(content); return { key: 'progress' }; } },
    { key: { remoteJid: 'chat' } }, ['bad name!'],
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /subreddit name/);

  const failing = load('../commands/meme.js', {
    '../utils/downloader': {},
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  }, async () => ({ ok: false, status: 503 }));
  const sent2 = [];
  await failing.execute(
    { sendMessage: async (jid, content) => { sent2.push(content); return { key: 'progress' }; } },
    { key: { remoteJid: 'chat' } }, [],
  );
  assert.ok(sent2.some(m => /meme request failed/.test(m.text)));
});

test('ship scores are deterministic, in range, and symmetric for any order', () => {
  const ship = load('../commands/ship.js');
  const a = ship.scorePair('Alice', 'Bob');
  const b = ship.scorePair('bob', 'ALICE');
  assert.equal(a, b, 'the same pair always ships the same regardless of order');
  assert.ok(a >= 55 && a <= 100);
  assert.equal(ship.barFor(80).length, 20, 'ten filled plus ten empty hearts');
  assert.match(ship.verdictFor(95), /Destined/);
  assert.match(ship.verdictFor(60), /spark/);
});

test('ship reads mentions first and falls back to two plain names', () => {
  const ship = load('../commands/ship.js');
  const joined = names => [...names].join(' | ');
  assert.equal(joined(ship.namesFrom(['254700000000@s.whatsapp.net', '254711111111@s.whatsapp.net'], [])), '+254700000000 | +254711111111');
  assert.equal(joined(ship.namesFrom([], ['Alice', '@Bob'])), 'Alice | Bob');
  assert.equal(ship.namesFrom([], ['onlyone']).length, 1);
  assert.equal(joined(ship.namesFrom([], ['name with; bad', 'Alice', 'Bob'])), 'Alice | Bob');
});

test('ship command replies with the meter for mentions and the usage hint otherwise', async () => {
  const sent = [];
  const ship = load('../commands/ship.js', { '../utils/downloader': {} });
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } };
  await ship.execute(sock, { key: { remoteJid: 'chat' }, message: { extendedTextMessage: { contextInfo: { mentionedJid: ['254700000000@s.whatsapp.net', '254711111111@s.whatsapp.net'] } } } }, []);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /\+254700000000 × \+254711111111/);
  assert.match(sent[0].text, /\d{2,3}%/);

  const sent2 = [];
  const sock2 = { sendMessage: async (jid, content) => { sent2.push(content); return { key: 'k' }; } };
  await ship.execute(sock2, { key: { remoteJid: 'chat' } }, []);
  assert.match(sent2.at(-1).text, /Ship \*two people\*/);
});
