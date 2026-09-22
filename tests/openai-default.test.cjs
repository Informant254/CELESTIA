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

function stubAxios(postImpl) {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { post: postImpl },
  };
  return () => {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
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

test('groq free tier is the default brain even when an openai key exists', async () => {
  const unaxios = stubAxios(async (url) => {
    assert.match(url, /groq\.com/);
    return { data: { choices: [{ message: { content: 'groq default' } }] } };
  });
  const unkeys = clearKeys();
  process.env.GROQ_API_KEY = 'gsk-test';
  process.env.OPENAI_API_KEY = 'sk-test';
  const uncodex = stubCodexOff();
  try {
    const backend = freshBackend();
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'groq default');
    assert.match(res.engine, /^groq\//);
  } finally {
    uncodex();
    unkeys();
    unaxios();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});
