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

test('ensureMediaUrl recovers via on-demand history sync when nothing is cached', async () => {
  const original = { viewOnceMessageV2: { message: { videoMessage: { viewOnce: true, mediaKey: Buffer.from('mk3'), url: 'https://mmg.whatsapp.net/hist', directPath: '/v/hist' } } } };
  const stripped = { viewOnceMessageV2: { message: { videoMessage: { viewOnce: true } } } };
  let calls = 0;
  const sock = {
    fetchMessageHistory: async (count, key) => {
      calls++;
      vault.rememberOriginal(key.id, original);
    },
    updateMediaMessage: async () => { throw new Error('should not be called'); },
  };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat', id: 'HIST-1', fromMe: true }, stripped);
  assert.equal(calls, 1);
  assert.equal(out.viewOnceMessageV2.message.videoMessage.url, 'https://mmg.whatsapp.net/hist');
  assert.equal(out.viewOnceMessageV2.message.videoMessage.directPath, '/v/hist');
});

test('ensureMediaUrl recovers via targeted placeholder resend before history sync', async () => {
  const original = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('mk4'), url: 'https://mmg.whatsapp.net/resend', directPath: '/v/resend' } } } };
  const stripped = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } };
  const order = [];
  const sock = {
    requestPlaceholderResend: async (key) => {
      order.push('resend:' + key.id);
      vault.rememberOriginal(key.id, original);
    },
    fetchMessageHistory: async () => { order.push('history'); },
    updateMediaMessage: async () => { throw new Error('should not be called'); },
  };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat', id: 'RESEND-1' }, stripped);
  assert.deepEqual(order, ['resend:RESEND-1']);
  assert.equal(out.viewOnceMessageV2.message.imageMessage.url, 'https://mmg.whatsapp.net/resend');
});

test('ensureMediaUrl falls back to history when placeholder resend is unavailable', async () => {
  const original = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('mk5'), url: 'https://mmg.whatsapp.net/hist2', directPath: '/v/hist2' } } } };
  const stripped = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } };
  let calls = 0;
  const sock = {
    fetchMessageHistory: async (count, key) => {
      calls++;
      vault.rememberOriginal(key.id, original);
    },
    updateMediaMessage: async () => { throw new Error('should not be called'); },
  };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat', id: 'HIST-2' }, stripped);
  assert.equal(calls, 1);
  assert.equal(out.viewOnceMessageV2.message.imageMessage.url, 'https://mmg.whatsapp.net/hist2');
});

test('ensureMediaUrl recovers a fully stripped quote from the arrival cache', async () => {
  const original = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('mk'), url: 'https://mmg.whatsapp.net/orig', directPath: '/v/orig', fileEncSha256: Buffer.from('h'), fileLength: 42 } } } };
  vault.rememberOriginal('MSGID-1', original);
  const stripped = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } };
  let reuploadCalls = 0;
  const sock = { updateMediaMessage: async () => { reuploadCalls++; } };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat', id: 'MSGID-1' }, stripped);
  const inner = out.viewOnceMessageV2.message.imageMessage;
  assert.equal(inner.url, 'https://mmg.whatsapp.net/orig');
  assert.equal(inner.directPath, '/v/orig');
  assert.equal(inner.fileLength, 42);
  assert.equal(reuploadCalls, 0, 'cache recovery must not trigger a reupload request');
});

test('ensureMediaUrl never sends a reupload without a mediaKey (the null crash)', async () => {
  const stripped = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } };
  let reuploadCalls = 0;
  const sock = { updateMediaMessage: async () => { reuploadCalls++; } };
  const out = await vault.ensureMediaUrl(sock, { remoteJid: 'chat', id: 'NOT-CACHED' }, stripped);
  assert.equal(reuploadCalls, 0);
  assert.equal(out, stripped);
});

test('recallOriginal expires old entries', () => {
  vault.rememberOriginal('OLD-ID', { conversation: 'x' });
  const hit = vault.recallOriginal('OLD-ID');
  assert.ok(hit);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 25 * 60 * 60 * 1000;
    assert.equal(vault.recallOriginal('OLD-ID'), null);
  } finally {
    Date.now = realNow;
  }
});

test('view-once sent from the owner phone (deviceSentMessage) is cached and recoverable', async () => {
  const deviceSent = { deviceSentMessage: { destinationJid: 'group@g.us', message: { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true, mediaKey: Buffer.from('mk2'), url: 'https://mmg.whatsapp.net/ds', directPath: '/v/ds' } } } } } };
  assert.equal(isViewOnceMessage({ key: {}, message: deviceSent }), true, 'vv detects deviceSent-wrapped view-once');
  assert.ok(vault.findViewOnce(deviceSent), 'vault finds deviceSent-wrapped view-once');
  vault.rememberOriginal('SELF-1', deviceSent);
  const strippedQuote = { viewOnceMessageV2: { message: { imageMessage: { viewOnce: true } } } };
  const out = await vault.ensureMediaUrl({}, { remoteJid: 'g@g.us', id: 'SELF-1' }, strippedQuote);
  assert.equal(out.viewOnceMessageV2.message.imageMessage.url, 'https://mmg.whatsapp.net/ds');
  assert.equal(out.viewOnceMessageV2.message.imageMessage.directPath, '/v/ds');
});
