const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APIX_KEY = process.env.APIX_KEY || 'test-key-for-voice-proof';
const axios = require('axios');
const backend = require('../autochat/backend');
const voice = require('../autochat/voice');
const settingsStore = require('../autochat/../utils/settingsStore');

test('openai fallback uses the configured model', async () => {
  process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
  const openaiPath = require.resolve('openai');
  const origExport = require.cache[openaiPath]?.exports;
  let captured = null;
  require.cache[openaiPath] = {
    id: openaiPath, filename: openaiPath, loaded: true,
    exports: { default: class FakeOpenAI {
      constructor() {}
      chat = { completions: { create: async (opts) => { captured = opts.model; return { choices: [{ message: { content: 'ok' } }] }; } } };
    } },
  };
  const prevEnv = process.env.OPENAI_MODEL;
  const prevStored = settingsStore.get('openai_model', null);
  try {
    delete process.env.OPENAI_MODEL;
    settingsStore.set('openai_model', null);
    assert.equal(backend.openaiModel(), 'gpt-4o-mini');
    process.env.OPENAI_MODEL = 'gpt-4o';
    assert.equal(backend.openaiModel(), 'gpt-4o');
    settingsStore.set('openai_model', 'gpt-4o-mini');
    assert.equal(backend.openaiModel(), 'gpt-4o-mini');
    const res = await backend.openai('sys', 'hi');
    assert.equal(res, 'ok');
    assert.equal(captured, 'gpt-4o-mini');
  } finally {
    if (prevEnv === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = prevEnv;
    settingsStore.set('openai_model', prevStored);
    if (origExport === undefined) delete require.cache[openaiPath]; else require.cache[openaiPath].exports = origExport;
  }
});

test('voice sampling spreads across the bank instead of newest-only', () => {
  const bank = Array.from({ length: 200 }, (_, i) => `line ${i}`);
  const picked = voice.pickSamples(bank);
  assert.equal(picked.length, 12);
  assert.ok(picked.includes('line 0'), 'oldest taught lines survive');
  assert.ok(picked.includes(bank.at(-1)) || picked.includes('line 183'), 'recent lines included');
  assert.equal(new Set(picked).size, picked.length);
  assert.deepEqual(voice.pickSamples(['a', 'b']), ['a', 'b']);
});

test('apix query carries the persona and voice samples, not a generic suffix', async () => {
  const orig = axios.get;
  let captured = null;
  axios.get = async (url, opts) => {
    captured = opts?.params?.q || '';
    return { data: { status: true, result: 'hey' } };
  };
  try {
    const marker = 'SYSTEM-voice-sample-marker-xyz';
    const res = await backend.complete(marker, 'hello there');
    assert.ok(res && String(res.engine).startsWith('apix/'));
    assert.ok(captured.includes(marker), 'persona/system must ship inside q');
    assert.ok(captured.includes('hello there'), 'incoming message must ship inside q');
    assert.ok(!captured.includes('chill teenager'), 'hardcoded generic instruction must be gone');
  } finally {
    axios.get = orig;
  }
});
