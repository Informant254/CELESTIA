const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APIX_KEY = process.env.APIX_KEY || 'test-key-for-voice-proof';
const axios = require('axios');
const backend = require('../autochat/backend');
const voice = require('../autochat/voice');
const settingsStore = require('../autochat/../utils/settingsStore');
const codex = require('../autochat/codex');

test('Codex text provider is isolated from bot secrets and agent tools', () => {
  process.env.APIX_KEY = 'must-not-reach-codex';
  process.env.SESSION_ID = 'must-not-reach-codex';
  const env = codex.safeEnv();
  assert.equal(env.APIX_KEY, undefined);
  assert.equal(env.SESSION_ID, undefined);
  const opts = codex.threadOptions();
  assert.equal(opts.sandboxMode, 'read-only');
  assert.equal(opts.approvalPolicy, 'never');
  assert.equal(opts.networkAccessEnabled, false);
  assert.equal(opts.webSearchMode, 'disabled');
  assert.equal(opts.skipGitRepoCheck, true);
});

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

test('voice sampling retrieves lessons relevant to the current message', () => {
  const bank = Array.from({ length: 196 }, (_, i) => `ordinary line ${i}`).concat([
    'football match was crazy fr', 'that goal was actually wild', 'we deserved that win', 'match day energy',
  ]);
  const picked = voice.pickSamples(bank, 12, 'that football match and goal were wild');
  assert.equal(picked.length, 12);
  assert.ok(picked.includes('football match was crazy fr'));
  assert.ok(picked.includes('that goal was actually wild'));
  assert.equal(new Set(picked).size, picked.length);
  assert.deepEqual(voice.pickSamples(['a', 'b']), ['a', 'b']);
});

test('manual teaching applies the same secret and duplicate filters', () => {
  const previous = settingsStore.get('autochat_voice', []);
  try {
    settingsStore.set('autochat_voice', []);
    assert.equal(voice.learn('hello there\nHELLO THERE!!\nsk-or-v1-abcdefghijklmnopqrstuvwxyz'), 1);
    assert.equal(voice.count(), 1);
  } finally {
    settingsStore.set('autochat_voice', previous);
  }
});

test('voice profile measures taught habits instead of imposing defaults', () => {
  const p = voice.profile(['Hello?', 'You good?', 'I AM HERE']);
  assert.equal(p.count, 3);
  assert.equal(p.medianLen, 9);
  assert.equal(Math.round(p.questionRate * 100), 67);
  assert.equal(p.lowercaseRate, 0);
});

test('apix query carries the persona and voice samples, not a generic suffix', async () => {
  const orig = axios.get;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = `${process.cwd()}/test-no-codex-auth`;
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
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousCodexHome;
  }
});

test('Apix truncation always preserves the complete current message', async () => {
  const orig = axios.get;
  const previousCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = `${process.cwd()}/test-no-codex-auth`;
  let captured = '';
  axios.get = async (_url, opts) => { captured = opts.params.q; return { data: { status: true, result: 'ok' } }; };
  try {
    const current = 'CURRENT-MESSAGE-' + 'x'.repeat(900);
    await backend.complete('SYSTEM-' + 's'.repeat(6000), current);
    assert.ok(captured.includes(current));
  } finally {
    axios.get = orig;
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousCodexHome;
  }
});
