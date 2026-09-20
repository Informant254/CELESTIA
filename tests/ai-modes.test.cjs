const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const backend = require('../autochat/backend');
const memory = require('../autochat/memory');
const human = require('../autochat/humanizer');
const functions = require('../autochat/functions');
const modes = require('../autochat/modes');
const persona = require('../autochat/persona');
const index = require('../autochat/index');

const CHAT = 'aimode-test@s.whatsapp.net';

function saveRestore(keys) {
  const prev = {};
  for (const k of keys) prev[k] = settingsStore.get(k, undefined);
  return () => {
    for (const k of keys) settingsStore.set(k, prev[k]);
  };
}

test('modes enable, switch and disable per chat', () => {
  const restore = saveRestore([modes.KEY]);
  try {
    settingsStore.set(modes.KEY, {});
    assert.equal(modes.active(CHAT), null);
    assert.equal(modes.enable(CHAT, 'claude'), true);
    assert.equal(modes.active(CHAT), 'claude');
    assert.equal(modes.enable(CHAT, 'wormgpt'), true);
    assert.equal(modes.active(CHAT), 'wormgpt');
    assert.equal(modes.enable(CHAT, 'nope'), false);
    assert.equal(modes.disable(CHAT), true);
    assert.equal(modes.active(CHAT), null);
    assert.equal(modes.disable(CHAT), false);
  } finally {
    restore();
    memory.clear(`claude::${CHAT}`);
    memory.clear(`wormgpt::${CHAT}`);
    memory.clear(`gpt::${CHAT}`);
  }
});

test('tool block exposes only safe generative functions', () => {
  const block = functions.toolBlock();
  for (const name of ['imagine', 'video', 'aisticker', 'tts']) assert.match(block, new RegExp(name));
  for (const name of ['kick', 'ban', 'block', 'antibot', 'remove', 'settings', 'mode']) {
    assert.ok(!new RegExp(`\\b${name}\\b.*\\(desc\\)|Available functions:[^\\n]*\\b${name}\\b`).test(block), `no ${name} function`);
  }
  assert.match(block, /at most ONE tag per reply/);
});

test('function tag extraction parses, strips and caps', () => {
  const r = functions.extract('Here you go:\n[FUNC imagine: a purple wolf under stars]');
  assert.equal(r.func, 'imagine');
  assert.equal(r.arg, 'a purple wolf under stars');
  assert.ok(!r.clean.includes('[FUNC'), 'tag stripped from chat text');
  assert.match(r.clean, /Here you go/);
  const bad = functions.extract('do [FUNC kick: that guy] now');
  assert.equal(bad.func, null, 'moderation actions never parse');
  assert.match(bad.clean, /FUNC kick/, 'unknown tags left untouched');
  const plain = functions.extract('just chatting');
  assert.equal(plain.func, null);
  const long = functions.extract(`[FUNC tts: ${'x'.repeat(900)}]`);
  assert.ok(long.arg.length <= functions.ALLOW.tts.max, 'args capped');
});

test('function runner executes commands from the live map', async () => {
  const calls = [];
  const fake = new Map([
    ['imagine', { execute: async (sock, msg, args) => { calls.push({ cmd: 'imagine', args }); } }],
  ]);
  const msg = { key: { remoteJid: CHAT, id: 'm1', fromMe: false } };
  const sock = { sendMessage: async () => ({ key: { id: 's1' } }) };
  assert.equal(await functions.run(sock, msg, fake, 'imagine', 'purple wolf'), true);
  assert.deepEqual(calls[0].args, ['purple', 'wolf']);
  assert.equal(await functions.run(sock, msg, fake, 'kick', 'someone'), false);
  assert.equal(await functions.run(sock, msg, fake, 'video', 'clip'), false, 'missing command fails safe');
  assert.equal(await functions.run(sock, msg, fake, 'tts', '   '), false, 'empty args fail safe');
});

function stubbedSock(calls) {
  return {
    user: {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, content, options) => {
      calls.push({ jid, content, options });
      return { key: { id: `s${calls.length}` } };
    },
  };
}

test('continuous mode answers ordinary text with a threaded quote', async () => {
  const restore = saveRestore([modes.KEY, 'gemini_key', 'prefix']);
  const prevComplete = backend.complete;
  settingsStore.set(modes.KEY, {});
  settingsStore.set('gemini_key', 'test-key');
  settingsStore.set('prefix', '.');
  backend.complete = async () => ({ text: 'Claude here, happy to help with that point.', engine: 'test' });
  try {
    modes.enable(CHAT, 'claude');
    const calls = [];
    const msg = { key: { remoteJid: CHAT, id: 'm1', fromMe: false }, pushName: 'Friend', message: { conversation: 'can you explain black holes to me please' } };
    const handled = await modes.handleIncoming(stubbedSock(calls), msg, 'can you explain black holes to me please', new Map());
    assert.equal(handled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.quoted, msg);
    assert.match(calls[0].content.text, /Claude here/);
    const mem = memory.get(`claude::${CHAT}`);
    assert.ok(mem.some((m) => m.role === 'them'), 'incoming remembered');
    assert.ok(mem.some((m) => m.role === 'me'), 'reply remembered');
  } finally {
    backend.complete = prevComplete;
    restore();
    memory.clear(`claude::${CHAT}`);
  }
});

test('continuous mode runs a function then delivers clean chat text', async () => {
  const restore = saveRestore([modes.KEY, 'gemini_key', 'prefix']);
  const prevComplete = backend.complete;
  settingsStore.set(modes.KEY, {});
  settingsStore.set('gemini_key', 'test-key');
  settingsStore.set('prefix', '.');
  backend.complete = async () => ({ text: 'On it, one sticker coming up:\n[FUNC aisticker: a purple wolf]', engine: 'test' });
  const ran = [];
  const fake = new Map([['aisticker', { execute: async (sock, msg, args) => { ran.push(args.join(' ')); } }]]);
  try {
    modes.enable(CHAT, 'wormgpt');
    const calls = [];
    const msg = { key: { remoteJid: CHAT, id: 'm2', fromMe: false }, pushName: 'Friend', message: { conversation: 'make me a sticker of a purple wolf please' } };
    const handled = await modes.handleIncoming(stubbedSock(calls), msg, 'make me a sticker of a purple wolf please', fake);
    assert.equal(handled, true);
    assert.deepEqual(ran, ['a purple wolf']);
    const texts = calls.filter((c) => c.content.text).map((c) => c.content.text);
    assert.ok(texts.length >= 1);
    assert.ok(texts.every((t) => !t.includes('[FUNC')), 'no raw tags leak to chat');
  } finally {
    backend.complete = prevComplete;
    restore();
    memory.clear(`wormgpt::${CHAT}`);
  }
});

test('continuous mode stays silent when off, self-sent, prefixed, or gated group', async () => {
  const restore = saveRestore([modes.KEY, 'gemini_key', 'prefix']);
  const prevComplete = backend.complete;
  settingsStore.set(modes.KEY, {});
  settingsStore.set('gemini_key', 'test-key');
  settingsStore.set('prefix', '.');
  let backendCalls = 0;
  backend.complete = async () => { backendCalls++; return { text: 'hi', engine: 'test' }; };
  try {
    const msg = (over) => ({ key: { remoteJid: CHAT, id: 'm', fromMe: false, ...over }, pushName: 'F', message: { conversation: 'hello there friend' } });
    assert.equal(await modes.handleIncoming(stubbedSock([]), msg(), 'hello there friend', new Map()), false, 'off stays silent');
    modes.enable(CHAT, 'gpt');
    assert.equal(await modes.handleIncoming(stubbedSock([]), msg({ fromMe: true }), 'hello there friend', new Map()), false, 'own messages never answered');
    assert.equal(await modes.handleIncoming(stubbedSock([]), msg(), '.menu', new Map()), false, 'commands pass through');
    const gmsg = { key: { remoteJid: '999@g.us', id: 'g1', fromMe: false }, pushName: 'F', message: { conversation: 'hello there friend' } };
    assert.equal(await modes.handleIncoming(stubbedSock([]), gmsg, 'hello there friend', new Map()), false, 'unopted group stays silent');
    assert.equal(backendCalls, 0, 'no provider calls when gated');
  } finally {
    backend.complete = prevComplete;
    restore();
    memory.clear(`gpt::${CHAT}`);
  }
});

test('claude command toggles its continuous session', async () => {
  const restore = saveRestore([modes.KEY]);
  const claude = require('../commands/claude');
  settingsStore.set(modes.KEY, {});
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 's' } }; } };
  const msg = { key: { remoteJid: CHAT, id: 'm', fromMe: true } };
  try {
    await claude.execute(sock, msg, ['on'], new Map());
    assert.equal(modes.active(CHAT), 'claude');
    assert.match(sent.at(-1).text, /live in this chat/);
    await claude.execute(sock, msg, ['off'], new Map());
    assert.equal(modes.active(CHAT), null);
  } finally {
    restore();
  }
});

test('enabling a session inside a group also opts the group in', async () => {
  const restore = saveRestore([modes.KEY, 'autochat_groups']);
  const claude = require('../commands/claude');
  settingsStore.set(modes.KEY, {});
  settingsStore.set('autochat_groups', []);
  const sock = { sendMessage: async () => ({ key: { id: 's' } }) };
  const msg = { key: { remoteJid: '555@g.us', id: 'm', fromMe: true } };
  try {
    await claude.execute(sock, msg, ['on'], new Map());
    assert.equal(modes.active('555@g.us'), 'claude');
    assert.ok(index.isGroupAllowed('555@g.us'), 'group opted in so reply/tag gating can pass');
  } finally {
    restore();
  }
});

test('long mode answers split at whatsapp-safe boundaries', () => {
  const parts = modes.splitLong(`${'a'.repeat(3990)}\n${'b'.repeat(100)}`);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.length <= 4000));
  assert.deepEqual(modes.splitLong('short'), ['short']);
});

test('autochat persona advertises function ability', () => {
  const chatId = 'aimode-persona@s.whatsapp.net';
  memory.clear(chatId);
  const built = persona.build({ chatId, incoming: 'draw me something', pushName: 'Owner', contactName: 'Friend' });
  assert.match(built.system, /\[FUNC imagine/);
  memory.clear(chatId);
});

test('autochat runs a tagged function before delivering clean text', async () => {
  const restore = saveRestore([index.MODE_KEY, 'gemini_key', 'prefix']);
  const prevComplete = backend.complete;
  const prevSleep = human.sleep;
  const prevRead = human.readDelayMs;
  const prevType = human.typeDelayMs;
  settingsStore.set(index.MODE_KEY, 'dm');
  settingsStore.set('gemini_key', 'test-key');
  settingsStore.set('prefix', '.');
  backend.complete = async () => ({ text: 'Picture incoming:\n[FUNC imagine: a sunset over Nairobi]', engine: 'test' });
  human.sleep = async () => {};
  human.readDelayMs = () => 0;
  human.typeDelayMs = () => 0;
  const ran = [];
  const fake = new Map([['imagine', { execute: async (sock, msg, args) => { ran.push(args.join(' ')); } }]]);
  const chatId = 'aimode-autofunc@s.whatsapp.net';
  memory.clear(chatId);
  try {
    const calls = [];
    const msg = { key: { remoteJid: chatId, id: 'm1', fromMe: false }, pushName: 'Friend', message: { conversation: 'draw me a sunset over Nairobi please' } };
    const handled = await index.handleIncoming(stubbedSock(calls), msg, 'draw me a sunset over Nairobi please', { commands: fake });
    assert.equal(handled, true);
    assert.deepEqual(ran, ['a sunset over Nairobi']);
    const texts = calls.filter((c) => c.content.text).map((c) => c.content.text);
    assert.ok(texts.every((t) => !t.includes('[FUNC')), 'no raw tags leak to chat');
    assert.equal(calls[0].options?.quoted, msg, 'still threaded');
  } finally {
    backend.complete = prevComplete;
    human.sleep = prevSleep;
    human.readDelayMs = prevRead;
    human.typeDelayMs = prevType;
    restore();
    memory.clear(chatId);
  }
});
