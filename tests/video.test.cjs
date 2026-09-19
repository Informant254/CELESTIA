const { test } = require('node:test');
const assert = require('node:assert/strict');

const axios = require('axios');
const settingsStore = require('../utils/settingsStore');
const video = require('../commands/video');

function fakeSock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
}
const msg = () => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true }, pushName: 'Boss' });
const MP4 = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

function withKey(key = 'test-pk-key') {
  const prev = settingsStore.get('pollinations_key', null);
  settingsStore.set('pollinations_key', key);
  return () => settingsStore.set('pollinations_key', prev);
}

test('prompt reaches the video endpoint and mp4 is delivered', async () => {
  const restoreKey = withKey();
  const origGet = axios.get;
  let capturedUrl = null;
  axios.get = async (url, opts) => {
    capturedUrl = url;
    assert.ok(opts.headers.Authorization.startsWith('Bearer '), 'gateway auth sent');
    return { data: MP4, headers: { 'content-type': 'video/mp4' } };
  };
  try {
    const sent = [];
    await video.execute(fakeSock(sent), msg(), ['a', 'dog', 'driving', 'a', 'car']);
    assert.ok(capturedUrl.includes('/video/'), 'video endpoint used');
    assert.ok(capturedUrl.includes(encodeURIComponent('a dog driving a car')), 'full prompt sent');
    const clip = sent.find((s) => s.video);
    assert.ok(clip, 'video message sent');
    assert.ok(clip.caption.includes('Engine:'), 'engine named');
  } finally {
    axios.get = origGet;
    restoreKey();
  }
});

test('--model flag switches the engine per request', async () => {
  const restoreKey = withKey();
  const origGet = axios.get;
  let capturedUrl = null;
  axios.get = async (url) => {
    capturedUrl = url;
    return { data: MP4, headers: { 'content-type': 'video/mp4' } };
  };
  try {
    const sent = [];
    await video.execute(fakeSock(sent), msg(), ['ocean', 'waves', '--model', 'wan-2.2-fast']);
    assert.ok(capturedUrl.includes('model=wan-2.2-fast'), 'engine id passed through');
    assert.ok(!capturedUrl.includes('--model'), 'flag stripped from prompt');
    assert.ok(sent.find((s) => s.video)?.caption.includes('wan-2.2-fast'), 'caption names the engine');
  } finally {
    axios.get = origGet;
    restoreKey();
  }
});

test('missing key points at the shared setup', async () => {
  const prev = settingsStore.get('pollinations_key', null);
  settingsStore.set('pollinations_key', null);
  try {
    const sent = [];
    await video.execute(fakeSock(sent), msg(), ['a', 'sunset']);
    assert.ok(sent.at(-1).text.includes('.imagine setkey') || sent.at(-1).text.includes('imagine setkey'));
  } finally {
    settingsStore.set('pollinations_key', prev);
  }
});

test('exhausted balance names the cause, not a raw dump', async () => {
  const restoreKey = withKey();
  const origGet = axios.get;
  axios.get = async () => {
    const e = new Error('Request failed with status code 402');
    e.response = { status: 402, data: { error: { message: 'Insufficient balance.' } } };
    throw e;
  };
  try {
    const sent = [];
    await video.execute(fakeSock(sent), msg(), ['waves']);
    assert.ok(sent.at(-1).text.includes('balance exhausted'));
  } finally {
    axios.get = origGet;
    restoreKey();
  }
});

test('oversize clips are rejected before the WhatsApp send', async () => {
  const restoreKey = withKey();
  const origGet = axios.get;
  axios.get = async () => ({ data: Buffer.alloc(17 * 1024 * 1024), headers: { 'content-type': 'video/mp4' } });
  try {
    const sent = [];
    await video.execute(fakeSock(sent), msg(), ['waves']);
    assert.ok(sent.at(-1).text.includes('16MB'));
    assert.ok(!sent.find((s) => s.video), 'no doomed send attempted');
  } finally {
    axios.get = origGet;
    restoreKey();
  }
});
