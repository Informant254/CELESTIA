const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

function load(mocks, fetchImpl) {
  const filename = path.resolve(__dirname, '../commands/igdp.js');
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const requireMock = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id));
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: requireMock, module, exports: module.exports, process, console,
    URL, encodeURIComponent, Buffer, AbortSignal, fetch: fetchImpl,
  }, { filename });
  return module.exports;
}

const sentinel = AbortSignal.timeout(5000);

test('parseUsername handles plain handles and instagram profile links', () => {
  const igdp = load({}, undefined);
  const { parseUsername } = igdp.__internals;
  assert.equal(parseUsername(' @leomessi '), 'leomessi');
  assert.equal(parseUsername('https://www.instagram.com/ceo/?hl=en'), 'ceo');
  assert.equal(parseUsername('https://www.instagram.com/stories/ceo/123456/'), 'ceo');
  assert.throws(() => parseUsername('https://www.instagram.com/reel/CODE/'), /not a post or reel link/);
  assert.throws(() => parseUsername('https://facebook.com/ceo/'), /not an Instagram profile/);
  assert.throws(() => parseUsername('bad name!'), /letters, numbers, dots/);
});

test('fetchProfilePicture prefers the keyless instagram api and falls back to the page og:image', async () => {
  const api = {
    leo: { ok: true, json: async () => ({ data: { user: { profile_pic_url: 'https://cdn/p.jpg', profile_pic_url_hd: 'https://cdn/hd.jpg', full_name: 'Leo', is_private: true } } }) },
    gone: { ok: true, json: async () => ({ data: {} }) },
  };
  let page;
  const igdp = load({}, async (url) => {
    if (url.includes('web_profile_info')) {
      const username = url.match(/username=([^&]+)/)[1];
      const response = api[username];
      if (!response) return { ok: false, status: 429 };
      return response;
    }
    const hit = page;
    page = null;
    if (!hit) throw new Error('unexpected page fetch');
    return hit;
  });

  const viaApi = await igdp.__internals.fetchProfilePicture('leo', sentinel);
  assert.equal(viaApi.url, 'https://cdn/hd.jpg');
  assert.equal(viaApi.private, true);
  assert.equal(viaApi.provider, 'instagram');

  page = { ok: true, text: async () => '<meta property="og:image" content="https://a.cdn/CN1?u=x&amp;w=1080" />' };
  const og = await igdp.__internals.fetchProfilePicture('og', sentinel);
  assert.equal(og.url, 'https://a.cdn/CN1?u=x&w=1080');
  assert.equal(og.provider, 'web');

  await assert.rejects(igdp.__internals.fetchProfilePicture('gone', sentinel), /was not found/);
});

test('execute sends the downloaded profile picture and reports status', async () => {
  const igdp = load(
    { '../utils/downloader': { downloadBuffer: async (url) => Buffer.from('pic:' + url) } },
    async (url) => {
      if (url.includes('web_profile_info') && url.includes('username=ceo')) {
        return { ok: true, json: async () => ({ data: { user: { profile_pic_url: 'https://cdn/p.jpg', full_name: 'CEO' } } }) };
      }
      throw new Error('unexpected fetch');
    }
  );
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } };
  await igdp.execute(sock, { key: { remoteJid: 'chat' } }, ['ceo']);
  const image = sent.find((m) => m.image);
  assert.ok(image, 'an image message should be sent');
  assert.ok(Buffer.from(image.image).equals(Buffer.from('pic:https://cdn/p.jpg')));
  assert.match(image.caption, /@ceo|CEO/);
  assert.ok(sent.some((m) => m.text === '✅ Done!' && m.edit));
});

test('execute reports a friendly hint for invalid input', async () => {
  const igdp = load({ '../utils/downloader': {} }, undefined);
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } };
  await igdp.execute(sock, { key: { remoteJid: 'chat' } }, ['https://facebook.com/ceo/']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /not an Instagram profile/);
});
