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
  for (const k of ['OPENZEN_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'APIX_KEY', 'GROQ_API_KEY', 'NVIDIA_API_KEY']) {
    if (process.env[k] !== undefined) saved[k] = process.env[k];
    delete process.env[k];
  }
  return () => { for (const [k, v] of Object.entries(saved)) process.env[k] = v; };
}

test('nvidia answers through NIM with bearer auth', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data: { choices: [{ message: { content: 'nim says hi' } }] } };
  });
  const unkeys = clearKeys();
  process.env.NVIDIA_API_KEY = 'nvapi-test';
  const uncodex = stubCodexOff();
  const unlocal = stubLocalOff();
  try {
    const backend = freshBackend();
    assert.ok(backend.nvidiaKey(), 'key detected');
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'nim says hi');
    assert.match(res.engine, /^nvidia\//);
    assert.equal(calls[0].url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer nvapi-test');
    assert.equal(calls[0].body.model, 'mistralai/mistral-nemotron');
  } finally {
    unlocal();
    uncodex();
    unkeys();
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});

test('chain falls through groq failure into nvidia', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body) => {
    calls.push(url);
    if (url.includes('groq')) throw Object.assign(new Error('busy'), { response: { status: 429 } });
    return { data: { choices: [{ message: { content: 'nim backup' } }] } };
  });
  const unkeys = clearKeys();
  process.env.NVIDIA_API_KEY = 'nvapi-test';
  process.env.GROQ_API_KEY = 'gsk-test';
  const uncodex = stubCodexOff();
  const unlocal = stubLocalOff();
  try {
    const backend = freshBackend();
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'nim backup');
    assert.match(res.engine, /^nvidia\//);
    assert.ok(calls.some((u) => u.includes('groq')), 'groq tried first');
  } finally {
    unlocal();
    uncodex();
    unkeys();
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});
