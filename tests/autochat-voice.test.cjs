const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APIX_KEY = process.env.APIX_KEY || 'test-key-for-voice-proof';
const axios = require('axios');
const backend = require('../autochat/backend');
const voice = require('../autochat/voice');

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
