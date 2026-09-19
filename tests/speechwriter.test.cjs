const { test } = require('node:test');
const assert = require('node:assert/strict');

const backend = require('../autochat/backend');
const speechwriter = require('../commands/speechwriter');

function fakeSock(sent) {
  return { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 't1' } }; } };
}
const msg = () => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true }, pushName: 'Boss' });

test('a provider refusal triggers a reframed retry instead of delivery', async () => {
  const orig = backend.complete;
  const calls = [];
  backend.complete = async (system, user) => {
    calls.push(user);
    if (calls.length === 1) return { text: "I'm sorry, I can't help with that topic.", engine: 'apix/gemini' };
    return { text: 'A sincere appeal deserving of love...', engine: 'openrouter/glm' };
  };
  try {
    const sent = [];
    await speechwriter.execute(fakeSock(sent), msg(), ['why', 'girls', 'should', 'give', 'me', 'a', 'chance']);
    assert.equal(calls.length, 2);
    assert.ok(/respectful, sincere, non-manipulative/.test(calls[1]), 'retry reframes the ask');
    assert.ok(sent.at(-1).text.includes('A sincere appeal'), 'real speech delivered, not the refusal');
  } finally {
    backend.complete = orig;
  }
});

test('a clean speech is delivered with a single provider call', async () => {
  const orig = backend.complete;
  let calls = 0;
  backend.complete = async () => { calls++; return { text: 'Friends, we gather...', engine: 'gemini' }; };
  try {
    const sent = [];
    await speechwriter.execute(fakeSock(sent), msg(), ['how', 'to', 'pass', 'exams']);
    assert.equal(calls, 1);
    assert.ok(sent.at(-1).text.includes('Friends, we gather...'));
  } finally {
    backend.complete = orig;
  }
});

test('a double refusal suggests a rephrase instead of claiming offline', async () => {
  const orig = backend.complete;
  backend.complete = async () => ({ text: "I'm unable to help with that.", engine: 'x' });
  try {
    const sent = [];
    await speechwriter.execute(fakeSock(sent), msg(), ['anything']);
    assert.ok(sent.at(-1).text.includes('declined as worded'));
    assert.ok(!sent.at(-1).text.includes('offline'));
  } finally {
    backend.complete = orig;
  }
});
