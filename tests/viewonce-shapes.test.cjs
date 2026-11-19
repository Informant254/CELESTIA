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
