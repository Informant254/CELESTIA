const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const voice = require('../autochat/voice');
const persona = require('../autochat/persona');
const memory = require('../autochat/memory');
const human = require('../autochat/humanizer');
const backend = require('../autochat/backend');
const index = require('../autochat/index');

test('house flavor follows the same short playful logic as taught data', () => {
  const house = voice.houseLines();
  assert.ok(house.length >= 20, 'enough house flavor to rotate');
  assert.ok(house.every((l) => l.length >= 8 && l.length <= 60), 'short phone-sized lines');
  assert.ok(!house.some((l) => /malaya|kuma|nudes|sex\b/i.test(l)), 'respectful lines only');
  assert.ok(house.some((l) => /\?/.test(l)), 'some questions like taught data');
  assert.ok(house.some((l) => /😂|😭|🔥|😌|😏/.test(l)), 'same emoji energy');
});

test('style block blends stored lessons with house flavor', () => {
  const previous = settingsStore.get('autochat_voice', []);
  try {
    settingsStore.set('autochat_voice', ['my own taught line about the match']);
    const block = voice.styleBlock({ incoming: 'hello' });
    assert.match(block, /my own taught line about the match/);
    assert.match(block, /House flavor in the same energy/);
    assert.match(block, /OWNER STYLE FINGERPRINT \(1 taught lines \+ house flavor\)/);
  } finally {
    settingsStore.set('autochat_voice', previous);
  }
});

test('style block still has personality with an empty bank', () => {
  const previous = settingsStore.get('autochat_voice', []);
  try {
    settingsStore.set('autochat_voice', []);
    const block = voice.styleBlock({ incoming: 'hello' });
    assert.match(block, /House flavor in the same energy/);
  } finally {
    settingsStore.set('autochat_voice', previous);
  }
});

test('persona demands threading, fun and varied openers', () => {
  const chatId = 'reply-persona-test@s.whatsapp.net';
  memory.clear(chatId);
  const built = persona.build({ chatId, incoming: 'nimechoka leo', pushName: 'Owner', contactName: 'Friend' });
  assert.match(built.system, /answer THAT message first/i);
  assert.match(built.system, /BE COOL AND FUN/);
  assert.match(built.system, /Vary your openers/);
  assert.match(built.system, /Dry "ok"\/\"sawa\" alone is banned/);
  memory.clear(chatId);
});

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

async function withStubs(replyText, fn) {
  const prevMode = settingsStore.get('autochat_mode', 'off');
  const prevKey = settingsStore.get('gemini_key', null);
  const prevComplete = backend.complete;
  const prevSleep = human.sleep;
  const prevRead = human.readDelayMs;
  const prevType = human.typeDelayMs;
  settingsStore.set('autochat_mode', 'dm');
  settingsStore.set('gemini_key', 'test-key');
  backend.complete = async () => ({ text: replyText, engine: 'test' });
  human.sleep = async () => {};
  human.readDelayMs = () => 0;
  human.typeDelayMs = () => 0;
  try {
    await fn();
  } finally {
    settingsStore.set('autochat_mode', prevMode);
    settingsStore.set('gemini_key', prevKey);
    backend.complete = prevComplete;
    human.sleep = prevSleep;
    human.readDelayMs = prevRead;
    human.typeDelayMs = prevType;
  }
}

test('text reply quotes the triggering message instead of dropping bare', async () => {
  const chatId = 'reply-quote-test@s.whatsapp.net';
  memory.clear(chatId);
  await withStubs('Sasa, nimekupata 😂', async () => {
    const calls = [];
    const msg = { key: { remoteJid: chatId, id: 'm1', fromMe: false }, pushName: 'Friend', message: { conversation: 'hello there friend, how was your day today' } };
    const handled = await index.handleIncoming(stubbedSock(calls), msg, 'hello there friend, how was your day today');
    assert.equal(handled, true);
    const texts = calls.filter((c) => c.content.text);
    assert.equal(texts.length, 1);
    assert.equal(texts[0].options?.quoted, msg);
  });
  memory.clear(chatId);
});

test('multi-bubble reply quotes only the first bubble', async () => {
  const chatId = 'reply-multibubble-test@s.whatsapp.net';
  memory.clear(chatId);
  await withStubs('word '.repeat(60).trim(), async () => {
    const calls = [];
    const msg = { key: { remoteJid: chatId, id: 'm2', fromMe: false }, pushName: 'Friend', message: { conversation: 'tell me the whole story of what happened at the match last night' } };
    const handled = await index.handleIncoming(stubbedSock(calls), msg, 'tell me the whole story of what happened at the match last night');
    assert.equal(handled, true);
    const texts = calls.filter((c) => c.content.text);
    assert.ok(texts.length >= 2, 'long reply splits into bubbles');
    assert.equal(texts[0].options?.quoted, msg);
    assert.ok(texts.slice(1).every((c) => !c.options?.quoted), 'follow-ups stay bare');
  });
  memory.clear(chatId);
});

test('voice reply quotes the triggering message', async () => {
  const chatId = 'reply-voice-test@s.whatsapp.net';
  memory.clear(chatId);
  const speech = require('../utils/speech');
  const prevSynth = speech.synthesizeVoice;
  speech.synthesizeVoice = async () => Buffer.from('fake-audio');
  await withStubs('Sasa, nimekusikia 😂', async () => {
    const calls = [];
    const msg = { key: { remoteJid: chatId, id: 'm3', fromMe: false }, pushName: 'Friend', message: { conversation: 'a voice note transcript about the game last night' } };
    const handled = await index.handleIncoming(stubbedSock(calls), msg, 'a voice note transcript about the game last night', { voiceReply: true });
    assert.equal(handled, true);
    const audios = calls.filter((c) => c.content.audio);
    assert.equal(audios.length, 1);
    assert.equal(audios[0].options?.quoted, msg);
  }).finally(() => { speech.synthesizeVoice = prevSynth; });
  memory.clear(chatId);
});
