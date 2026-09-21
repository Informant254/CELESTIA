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

test('openzen posts to the zen chat endpoint with bearer auth', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body, opts) => {
    calls.push({ url, body, opts });
    return { data: { choices: [{ message: { content: '  hello human  ' } }] } };
  });
  const prev = process.env.OPENZEN_API_KEY;
  process.env.OPENZEN_API_KEY = 'zen-test-key';
  const uncodex = stubCodexOff();
  try {
    const backend = freshBackend();
    assert.ok(backend.openzenKey(), 'key detected');
    const res = await backend.complete('sys', 'hi');
    assert.equal(res.text, 'hello human');
    assert.match(res.engine, /^openzen\//);
    assert.equal(calls[0].url, 'https://opencode.ai/zen/v1/chat/completions');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer zen-test-key');
    assert.ok(calls[0].body.model.endsWith('-free') || calls[0].body.model === 'big-pickle', 'free model first');
  } finally {
    uncodex();
    if (prev === undefined) delete process.env.OPENZEN_API_KEY;
    else process.env.OPENZEN_API_KEY = prev;
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});

test('openzen fails over across free models then returns null', async () => {
  const calls = [];
  const restore = stubAxios(async (url, body) => {
    calls.push(body.model);
    throw Object.assign(new Error('overloaded'), { response: { status: 503 } });
  });
  const prev = process.env.OPENZEN_API_KEY;
  process.env.OPENZEN_API_KEY = 'zen-test-key';
  // Neutralize every other provider so only zen runs.
  const prevOr = process.env.OPENROUTER_API_KEY;
  const prevGem = process.env.GEMINI_API_KEY;
  const prevOai = process.env.OPENAI_API_KEY;
  const prevApix = process.env.APIX_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.APIX_KEY;
  const uncodex = stubCodexOff();
  const localPath = require.resolve('../autochat/local');
  const localOrig = require.cache[localPath]?.exports;
  require.cache[localPath] = {
    id: localPath, filename: localPath, loaded: true,
    exports: { status: () => ({ enabled: false }), generate: async () => null },
  };
  try {
    const backend = freshBackend();
    const res = await backend.complete('sys', 'hi');
    assert.equal(res, null);
    assert.ok(calls.length >= 2, 'tried multiple free models, got ' + calls.length);
  } finally {
    uncodex();
    if (localOrig === undefined) delete require.cache[localPath];
    else require.cache[localPath].exports = localOrig;
    if (prev === undefined) delete process.env.OPENZEN_API_KEY;
    else process.env.OPENZEN_API_KEY = prev;
    if (prevOr !== undefined) process.env.OPENROUTER_API_KEY = prevOr;
    if (prevGem !== undefined) process.env.GEMINI_API_KEY = prevGem;
    if (prevOai !== undefined) process.env.OPENAI_API_KEY = prevOai;
    if (prevApix !== undefined) process.env.APIX_KEY = prevApix;
    restore();
    delete require.cache[require.resolve('../autochat/backend')];
  }
});
