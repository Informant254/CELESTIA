const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const human = require('../autochat/humanizer');
const backend = require('../autochat/backend');
const memory = require('../autochat/memory');
const index = require('../autochat/index');
const modes = require('../autochat/modes');

function stubbedSock(calls) {
  return {
    user: { name: 'Owner' },
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, content, options) => {
      calls.push({ jid, content, options });
      return { key: { id: `s${calls.length}` } };
    },
  };
}

const dm = (id) => ({
  key: { remoteJid: 'dedup-test@s.whatsapp.net', id, fromMe: false },
  pushName: 'Friend',
  message: { conversation: 'hello there friend, how was your day today' },
});
const TEXT = 'hello there friend, how was your day today';

async function withStubs(fn) {
  const prevMode = settingsStore.get('autochat_mode', 'off');
  const prevKey = settingsStore.get('gemini_key', null);
  const prevComplete = backend.complete;
  const prevSleep = human.sleep;
  const prevRead = human.readDelayMs;
  const prevType = human.typeDelayMs;
  let calls = 0;
  settingsStore.set('autochat_mode', 'dm');
  settingsStore.set('gemini_key', 'test-key');
  const replies = ['Sunny skies over the city today 😂', 'Nairobi traffic is absolutely wild 😭'];
  backend.complete = async () => ({ text: replies[Math.min(calls++, replies.length - 1)], engine: 'test' });
  human.sleep = async () => {};
  human.readDelayMs = () => 0;
  human.typeDelayMs = () => 0;
  try {
    await fn(() => calls);
  } finally {
    settingsStore.set('autochat_mode', prevMode);
    settingsStore.set('gemini_key', prevKey);
    backend.complete = prevComplete;
    human.sleep = prevSleep;
    human.readDelayMs = prevRead;
    human.typeDelayMs = prevType;
  }
}

test('same message delivered twice runs the brain once and replies once', async () => {
  memory.clear('dedup-test@s.whatsapp.net');
  await withStubs(async (brainCalls) => {
    const calls = [];
    const first = await index.handleIncoming(stubbedSock(calls), dm('dup-1'), TEXT);
    const second = await index.handleIncoming(stubbedSock(calls), dm('dup-1'), TEXT);
    assert.equal(first, true, 'first delivery answered');
    assert.equal(second, true, 'repeat consumed, not re-answered');
    assert.equal(brainCalls(), 1, 'brain ran exactly once');
    assert.equal(calls.filter((c) => c.content.text).length, 1, 'one text reply sent');
  });
  memory.clear('dedup-test@s.whatsapp.net');
});

test('different messages each get their own reply', async () => {
  memory.clear('dedup-test@s.whatsapp.net');
  await withStubs(async (brainCalls) => {
    const calls = [];
    assert.equal(await index.handleIncoming(stubbedSock(calls), dm('fresh-1'), TEXT), true);
    assert.equal(await index.handleIncoming(stubbedSock(calls), dm('fresh-2'), TEXT), true);
    assert.equal(brainCalls(), 2, 'brain ran once per message');
  });
  memory.clear('dedup-test@s.whatsapp.net');
});

test('modes redelivery answers at most once', async () => {
  memory.clear('dedup-test@s.whatsapp.net');
  const prevModes = settingsStore.get('aichat_modes', {});
  settingsStore.set('aichat_modes', { 'dedup-test@s.whatsapp.net': 'gpt' });
  await withStubs(async (brainCalls) => {
    const calls = [];
    const first = await modes.handleIncoming(stubbedSock(calls), dm('mode-dup-1'), TEXT, new Map());
    const second = await modes.handleIncoming(stubbedSock(calls), dm('mode-dup-1'), TEXT, new Map());
    assert.equal(first, true, 'first delivery answered by mode');
    assert.equal(second, true, 'repeat consumed, not re-answered');
    assert.equal(brainCalls(), 1, 'modes brain ran exactly once, ran ' + brainCalls());
  });
  settingsStore.set('aichat_modes', prevModes);
  memory.clear('dedup-test@s.whatsapp.net');
});
