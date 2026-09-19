const { test } = require('node:test');
const assert = require('node:assert/strict');

const axios = require('axios');
const imagine = require('../commands/imagine');

function fakeSock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
}
const msg = (text) => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true }, pushName: 'Boss' });

test('full prompt is sent to the model with enhancement and seed echo', async () => {
  const orig = axios.get;
  let capturedUrl = null;
  // minimal valid PNG bytes
  const png = Buffer.from(['89504e470d0a1a0a0000000d49484452', '00000001000000010802000000907753', 'de0000000c49444154789c6360000000020001e221bc330000000049454e44ae426082'].join(''), 'hex');
  axios.get = async (url) => {
    capturedUrl = url;
    return { data: png, headers: { 'content-type': 'image/png' } };
  };
  try {
    const sent = [];
    const prompt = 'a lighthouse on basalt cliffs at blue hour, waves crashing, gulls, moody cinematic light, ultra detailed';
    await imagine.execute(fakeSock(sent), msg(), prompt.split(' '));
    assert.ok(capturedUrl.includes(encodeURIComponent(prompt)), 'entire prompt must reach the model');
    assert.ok(capturedUrl.includes('enhance=true'), 'prompt understanding stays on by default');
    const img = sent.find((s) => s.image);
    assert.ok(img, 'image message sent');
    assert.ok(img.caption.includes('Seed:'), 'seed echoed for reproducibility');
  } finally {
    axios.get = orig;
  }
});

test('content refusal is reported honestly instead of a generic error', async () => {
  const orig = axios.get;
  axios.get = async () => {
    const e = new Error('Request failed with status code 400');
    e.response = { status: 400, data: 'blocked by content filter' };
    throw e;
  };
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['a', 'portrait']);
    const last = sent.at(-1);
    assert.ok(last.text.includes('refused that prompt'), 'refusal must be named');
    assert.ok(!last.text.includes('Try again later'), 'no generic error');
  } finally {
    axios.get = orig;
  }
});

test('overlong prompts are capped for transport and flagged', async () => {
  const orig = axios.get;
  let capturedUrl = null;
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  axios.get = async (url) => {
    capturedUrl = url;
    return { data: png, headers: { 'content-type': 'image/png' } };
  };
  try {
    const sent = [];
    await imagine.execute(fakeSock(sent), msg(), ['x'.repeat(3000)]);
    assert.ok(capturedUrl.length < 4000, 'URL stays within transport limits');
    assert.ok(sent.find((s) => s.image)?.caption.includes('trimmed'), 'trim is disclosed');
  } finally {
    axios.get = orig;
  }
});
