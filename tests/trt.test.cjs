const { test } = require('node:test');
const assert = require('node:assert/strict');

const trt = require('../commands/trt');

const gtPath = require.resolve('@iamtraction/google-translate');

function fakeSock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
}
const baseMsg = () => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true }, pushName: 'Boss' });

function mockGoogle(impl) {
  const orig = require.cache[gtPath]?.exports;
  require.cache[gtPath] = {
    id: gtPath, filename: gtPath, loaded: true,
    exports: impl,
  };
  return () => {
    if (orig === undefined) delete require.cache[gtPath];
    else require.cache[gtPath].exports = orig;
  };
}

test('reply text is translated to the requested language', async () => {
  let captured = null;
  const restore = mockGoogle(async (text, opts) => {
    captured = { text, opts };
    return { text: 'Hello, how are you?', from: { language: { iso: 'sw' } } };
  });
  try {
    const sent = [];
    const msg = { ...baseMsg(), message: { extendedTextMessage: { text: '.trt en', contextInfo: { quotedMessage: { conversation: 'Hujambo, unaendeleaje?' } } } } };
    await trt.execute(fakeSock(sent), msg, ['en']);
    assert.equal(captured.opts.to, 'en');
    assert.ok(sent.at(-1).text.includes('Hello, how are you?'));
    assert.ok(sent.at(-1).text.includes('Swahili'));
  } finally {
    restore();
  }
});

test('direct text without reply translates to English by default', async () => {
  const restore = mockGoogle(async () => ({ text: 'Good morning', from: { language: { iso: 'fr' } } }));
  try {
    const sent = [];
    await trt.execute(fakeSock(sent), baseMsg(), ['Bonjour', 'tout', 'le', 'monde']);
    assert.ok(sent.at(-1).text.includes('Good morning'));
    assert.ok(sent.at(-1).text.includes('To: English'));
  } finally {
    restore();
  }
});

test('google outage falls back to mymemory instead of failing', async () => {
  const restore = mockGoogle(async () => { throw new Error('google down'); });
  const origFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ responseData: { translatedText: 'Hola mundo' } }) });
  try {
    const sent = [];
    await trt.execute(fakeSock(sent), baseMsg(), ['es', 'Hello', 'world']);
    assert.ok(sent.at(-1).text.includes('Hola mundo'));
  } finally {
    restore();
    global.fetch = origFetch;
  }
});

test('missing text shows usage instead of crashing', async () => {
  const sent = [];
  await trt.execute(fakeSock(sent), baseMsg(), []);
  assert.ok(sent.at(-1).text.includes('.trt [lang]'));
});
