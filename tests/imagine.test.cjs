const { test } = require('node:test');
const assert = require('node:assert/strict');

const axios = require('axios');
const settingsStore = require('../utils/settingsStore');
const imagine = require('../commands/imagine');

function fakeSock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
}
const msg = () => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true }, pushName: 'Boss' });
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function stubNet({ post, get }) {
  const origPost = axios.post;
  const origGet = axios.get;
  if (post) axios.post = post;
  if (get) axios.get = get;
  return () => { axios.post = origPost; axios.get = origGet; };
}

function withKey(key = 'test-pk-key') {
  const prev = settingsStore.get('pollinations_key', null);
  settingsStore.set('pollinations_key', key);
  return () => settingsStore.set('pollinations_key', prev);
}

test('full prompt reaches the gateway model with size mapping', async () => {
  const restoreKey = withKey();
  let captured = null;
  const restoreNet = stubNet({
    post: async (url, body) => {
      captured = { url, body };
      return { data: { data: [{ b64_json: PNG_B64 }] } };
    },
  });
  try {
    const sent = [];
    const prompt = 'a dog driving a vintage car down a coastal road at sunset, cinematic light, ultra detailed';
    await imagine.execute(fakeSock(sent), msg(), [...prompt.split(' '), '--wide']);
    assert.ok(captured.url.endsWith('/v1/images/generations'), 'uses the authenticated gateway');
    assert.equal(captured.body.prompt, prompt);
    assert.equal(captured.body.size, '1792x1024', 'wide maps to landscape size');
    const img = sent.find((s) => s.image);
    assert.ok(img, 'image message sent');
    assert.ok(img.caption.includes('Engine:'), 'engine named in caption');
  } finally {
    restoreNet();
    restoreKey();
  }
});

test('missing key guides to free setup instead of a raw 402 dump', async () => {
  const prev = settingsStore.get('pollinations_key', null);
  settingsStore.set('pollinations_key', null);
  const restoreNet = stubNet({
    get: async () => {
      const e = new Error('Request failed with status code 402');
      e.response = { status: 402, data: { error: { message: 'Insufficient balance.' } } };
      throw e;
    },
  });
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['a', 'dog', 'driving', 'a', 'car']);
    const last = sent.at(-1);
    assert.ok(last.text.includes('.imagine setkey'), 'setup path given');
    assert.ok(last.text.includes('enter.pollinations.ai'), 'key source named');
    assert.ok(!last.text.includes('{"error"'), 'no raw JSON dump');
  } finally {
    restoreNet();
    settingsStore.set('pollinations_key', prev);
  }
});

test('setkey stores the key from chat', async () => {
  const prev = settingsStore.get('pollinations_key', null);
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['setkey', 'pk-test-123456']);
    assert.equal(settingsStore.get('pollinations_key', null), 'pk-test-123456');
    assert.ok(sent.at(-1).text.includes('stored'));
  } finally {
    settingsStore.set('pollinations_key', prev);
  }
});

test('content refusal is reported honestly instead of a generic error', async () => {
  const restoreKey = withKey();
  const restoreNet = stubNet({
    post: async () => {
      const e = new Error('Request failed with status code 400');
      e.response = { status: 400, data: { error: { message: 'blocked by content filter' } } };
      throw e;
    },
  });
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['a', 'portrait']);
    const last = sent.at(-1);
    assert.ok(last.text.includes('refused that prompt'), 'refusal must be named');
    assert.ok(!last.text.includes('Try again later'), 'no generic error');
  } finally {
    restoreNet();
    restoreKey();
  }
});

test('gateway outage falls back to the legacy pool', async () => {
  const restoreKey = withKey();
  let legacyUrl = null;
  const restoreNet = stubNet({
    post: async () => { throw new Error('gateway down'); },
    get: async (url) => {
      legacyUrl = url;
      return { data: Buffer.from(PNG_B64, 'base64'), headers: { 'content-type': 'image/png' } };
    },
  });
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['a', 'lighthouse']);
    assert.ok(legacyUrl.includes('image.pollinations.ai'), 'legacy pool attempted');
    assert.ok(sent.find((s) => s.image), 'image still delivered');
  } finally {
    restoreNet();
    restoreKey();
  }
});
