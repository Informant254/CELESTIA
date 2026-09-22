const { test } = require('node:test');
const assert = require('node:assert/strict');

function freshBackend() {
  delete require.cache[require.resolve('../autochat/backend')];
  return require('../autochat/backend');
}

function stubCodexOff() {
  const codexPath = require.resolve('../autochat/codex');
  const orig = require.cache[codexPath]?.exports;
  require.cache[codexPath] = {
    id: codexPath, filename: codexPath, loaded: true,
    exports: { status: () => ({ authenticated: false }), model: () => 'off', generate: async () => null },
  };
  return () => {
    if (orig === undefined) delete require.cache[codexPath];
    else require.cache[codexPath].exports = orig;
  };
}

function stubLocalOff() {
  const localPath = require.resolve('../autochat/local');
  const orig = require.cache[localPath]?.exports;
  require.cache[localPath] = {
    id: localPath, filename: localPath, loaded: true,
    exports: { status: () => ({ enabled: false }), generate: async () => null },
  };
  return () => {
    if (orig === undefined) delete require.cache[localPath];
    else require.cache[localPath].exports = orig;
  };
}

function clearKeys() {
  const saved = {};
  for (const k of ['OPENZEN_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'APIX_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY']) {
    if (process.env[k] !== undefined) saved[k] = process.env[k];
    delete process.env[k];
  }
  return () => { for (const [k, v] of Object.entries(saved)) process.env[k] = v; };
}

test('openai is the default brain when its key is set', async () => {
  const openaiPath = require.resolve('openai');
  const orig = require.cache[openaiPath]?.exports;
  const calls = [];
  function FakeOpenAI(opts) {
    calls.push(opts);
    this.chat = { completions: { create: async () => ({ choices: [{ message: { content: 'oi default' } }] }) } };
  }
  require.cache[openaiPath] = { id: openaiPath, filename: openaiPath, loaded: true, exports: { default: FakeOpenAI } };
  const unkeys = clearKeys();
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.GROQ_API_KEY = 'gsk-test';
  const uncodex = stubCodexOff();
  const unlocal = stubLocalOff();
  try {
    const backend = freshBackend();
    assert.ok(backend.openaiKey(), 'key detected');
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'oi default');
    assert.match(res.engine, /^openai\//);
    assert.equal(calls[0].apiKey, 'sk-test');
  } finally {
    unlocal();
    uncodex();
    unkeys();
    if (orig === undefined) delete require.cache[openaiPath];
    else require.cache[openaiPath].exports = orig;
    delete require.cache[require.resolve('../autochat/backend')];
  }
});
