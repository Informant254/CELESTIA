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

function stubAxios(handler) {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: async () => { throw new Error('unused'); }, post: handler },
  };
  return () => {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  };
}

function clearKeys() {
  const saved = {};
  for (const k of ['OPENZEN_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'APIX_KEY', 'GROQ_API_KEY']) {
    if (process.env[k] !== undefined) saved[k] = process.env[k];
    delete process.env[k];
  }
  return () => { for (const [k, v] of Object.entries(saved)) process.env[k] = v; };
}

test('groq answers through its own endpoint with bearer auth', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data: { choices: [{ message: { content: 'groq says hi' } }] } };
  });
  const unkeys = clearKeys();
  process.env.GROQ_API_KEY = 'gsk-test';
  const uncodex = stubCodexOff();
  const unlocal = stubLocalOff();
  try {
    const backend = freshBackend();
    assert.ok(backend.groqKey(), 'key detected');
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'groq says hi');
    assert.match(res.engine, /^groq\//);
    assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer gsk-test');
  } finally {
    unlocal();
    uncodex();
    unkeys();
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});

test('groq fails over across models then yields to the next brain', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body) => {
    calls.push(body.model);
    if (url.includes('groq')) throw Object.assign(new Error('busy'), { response: { status: 429 } });
    return { data: { choices: [{ message: { content: 'zen backup' } }] } };
  });
  const unkeys = clearKeys();
  process.env.GROQ_API_KEY = 'gsk-test';
  process.env.OPENZEN_API_KEY = 'zen-test';
  const uncodex = stubCodexOff();
  const unlocal = stubLocalOff();
  try {
    const backend = freshBackend();
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'zen backup');
    assert.match(res.engine, /^openzen\//);
    assert.ok(calls.length >= 4, 'groq chain then zen, got ' + calls.length);
  } finally {
    unlocal();
    uncodex();
    unkeys();
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});
