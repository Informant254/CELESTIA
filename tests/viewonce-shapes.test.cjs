const { test } = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../commands/vv.js');
const vault = require('../utils/viewonceVault.js');

const { isViewOnceMessage, extractViewOnceMedia, unwrapViewOnce } = __test;

const quote = (message) => ({ key: { remoteJid: 'chat' }, message });

test('.vv detects every real-world view-once container', () => {
  const shapes = {
    'direct image flag': { imageMessage: { viewOnce: true, mimetype: 'image/jpeg' } },
    'direct video flag': { videoMessage: { viewOnce: true } },
    'direct audio flag': { audioMessage: { viewOnce: true } },
    viewOnceMessageV2: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } },
    viewOnceMessageV2Extension: { viewOnceMessageV2Extension: { message: { videoMessage: { viewOnce: true } } } },
    viewOnceMessage: { viewOnceMessage: { message: { audioMessage: { viewOnce: true } } } },
    'ephemeral → v2': { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: {} } } } } },
    'documentWithCaptionMessage → v2': { documentWithCaptionMessage: { message: { viewOnceMessageV2: { message: { imageMessage: {} } } } } },
    'ephemeral → documentWithCaptionMessage → v2': { ephemeralMessage: { message: { documentWithCaptionMessage: { message: { viewOnceMessageV2: { message: { videoMessage: {} } } } } } } },
  };
  for (const [name, message] of Object.entries(shapes)) {
    assert.equal(isViewOnceMessage(quote(message)), true, name);
    const found = extractViewOnceMedia(quote(message));
    assert.ok(found, `extract ${name}`);
    assert.ok(['image', 'video', 'audio', 'sticker'].includes(found.type), name);
  }
});

test('.vv rejects plain media, text, and missing quotes', () => {
  assert.equal(isViewOnceMessage(quote({ imageMessage: { mimetype: 'image/jpeg' } })), false, 'plain image');
  assert.equal(isViewOnceMessage(quote({ videoMessage: { seconds: 3 } })), false, 'plain video');
  assert.equal(isViewOnceMessage(quote({ conversation: 'hello' })), false, 'text');
  assert.equal(isViewOnceMessage({ key: {} }), false, 'no message');
});

test('vault findViewOnce agrees with the vv unwrapper on nested containers', () => {
  const nested = { ephemeralMessage: { message: { documentWithCaptionMessage: { message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } } } } } };
  const found = vault.findViewOnce(nested);
  assert.equal(found?.type, 'image');
  assert.equal(vault.findViewOnce({ imageMessage: { viewOnce: true } })?.type, 'image');
  assert.equal(vault.findViewOnce({ imageMessage: {} }), null);
});

test('ensureMediaUrl requests a reupload when url/directPath are stripped', async () => {
  const wrapper = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('k'), fileLength: 10 } } } };
  let refreshed = false;
  const sock = {
    updateMediaMessage: async (m) => {
      refreshed = true;
      const inner = m.message.viewOnceMessageV2.message.imageMessage;
      inner.directPath = '/v/t62.7118-24/fresh';
      inner.url = 'https://mmg.whatsapp.net/v/t62.7118-24/fresh';
      return m;
    },
  };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat@s.whatsapp.net', id: 'ABC123', participant: 'x@s.whatsapp.net' }, wrapper);
  assert.equal(refreshed, true);
  assert.equal(out.viewOnceMessageV2.message.imageMessage.directPath, '/v/t62.7118-24/fresh');
});

test('ensureMediaUrl is a no-op when url already exists or reupload fails', async () => {
  const withUrl = { viewOnceMessageV2: { message: { imageMessage: { url: 'https://mmg.whatsapp.net/x', mediaKey: Buffer.from('k') } } } };
  let calls = 0;
  const sock = { updateMediaMessage: async () => { calls++; } };
  await vault.ensureMediaUrl(sock, { remoteJid: 'c', id: '1' }, withUrl);
  assert.equal(calls, 0, 'no reupload needed when url present');

  const bare = { viewOnceMessageV2: { message: { imageMessage: { mediaKey: Buffer.from('k') } } } };
  const failingSock = { updateMediaMessage: async () => { throw new Error('sender offline'); } };
  const out = await vault.ensureMediaUrl(failingSock, { remoteJid: 'c', id: '2' }, bare);
  assert.equal(out, bare, 'returns the original wrapper when refresh fails');
  assert.equal(out.viewOnceMessageV2.message.imageMessage.url, undefined);
});
