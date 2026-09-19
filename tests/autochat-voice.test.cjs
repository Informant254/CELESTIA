const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.APIX_KEY = process.env.APIX_KEY || 'test-key-for-voice-proof';
const axios = require('axios');
const backend = require('../autochat/backend');

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
