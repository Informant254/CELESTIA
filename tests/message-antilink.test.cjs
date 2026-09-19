const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const filename = path.resolve(__dirname, '../events/messages.js');
const source = fs.readFileSync(filename, 'utf8');
const realRequire = createRequire(filename);

function harness({ privacy = 'private', mode = 'on', global = false, botAdmin = true } = {}) {
  const settings = { mode: privacy, prefix: '.', antilinkall: global };
  const sent = [];
  let handler, aiCalls = 0;
  const stubs = {
    '../config/config': { WORK_TYPE: privacy, prefix: '.', ownerNumber: '1' },
    '../utils/settingsStore': { get: (key, fallback) => settings[key] ?? fallback },
    '../utils/groupSettingsStore': { get: (jid, key, fallback) => key === 'antilink' ? mode : fallback },
    '../utils/logger': { info() {}, warn() {}, error(error) { throw new Error(error); } },
    '../utils/isSudo': { isSudo: () => false },
    '../utils/viewonceVault': { isAutoOn: () => false, monitorReply: async () => {} },
    '../autochat/index': { handleIncoming: async () => { aiCalls++; return true; } },
    fs: { readFileSync: () => '1' },
  };
  const context = {
    require: id => id in stubs ? stubs[id] : realRequire(id),
    module: { exports: {} }, __dirname: path.dirname(filename), console: { log() {} },
  };
  vm.runInNewContext(source, context, { filename });
  const sock = {
    user: { id: '1:58@s.whatsapp.net', lid: '10:58@lid' },
    ev: { on: (event, fn) => { if (event === 'messages.upsert') handler = fn; } },
    groupMetadata: async () => ({ participants: [
      { id: '10@lid', admin: botAdmin ? 'admin' : null }, { id: '20@lid' },
    ] }),
    sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'sent' } }; },
  };
  context.module.exports.registerMessageHandler(sock, new Map());
  return {
    sent, aiCalls: () => aiCalls,
    send: (message, overrides = {}) => handler({ type: 'notify', messages: [{
      key: { remoteJid: 'test@g.us', id: Math.random().toString(), fromMe: false, participant: '20@lid', ...overrides },
      message, messageTimestamp: Math.floor(Date.now() / 1000),
    }] }),
  };
}

test('private mode still deletes member links before the privacy gate', async () => {
  const h = harness();
  await h.send({ conversation: 'https://google.com' });
  assert.equal(h.sent.length, 1);
  assert.ok(h.sent[0].delete);
  assert.equal(h.aiCalls(), 0);
});

test('autochat cannot consume links before moderation', async () => {
  const h = harness({ privacy: 'public' });
  await h.send({ conversation: 'https://google.com' });
  assert.ok(h.sent[0].delete);
  assert.equal(h.aiCalls(), 0);
});

test('wrapped disappearing-message captions are moderated', async () => {
  const h = harness();
  await h.send({ ephemeralMessage: { message: { imageMessage: { caption: 'https://google.com' } } } });
  assert.ok(h.sent[0].delete);
});

test('global antilink applies with local mode off', async () => {
  const h = harness({ mode: 'off', global: true });
  await h.send({ conversation: 'https://google.com' });
  assert.ok(h.sent[0].delete);
});

test('private mode remains silent for ordinary text, disabled moderation and DMs', async () => {
  for (const [options, message, key] of [
    [{}, 'hello', {}], [{ mode: 'off' }, 'https://google.com', {}],
    [{}, 'https://google.com', { remoteJid: '20@lid' }],
    [{ botAdmin: false }, 'https://google.com', {}],
  ]) {
    const h = harness(options);
    await h.send({ conversation: message }, key);
    assert.equal(h.sent.length, 0);
    assert.equal(h.aiCalls(), 0);
  }
});

test('antilinkall owner command works in DM and has no group-only guard', async () => {
  const file = path.resolve(__dirname, '../commands/antilinkall.js');
  const sent = [], settings = {};
  const context = { module: { exports: {} }, require: id => {
    if (id.endsWith('/isOwner')) return { isOwner: () => true };
    return { get: (key, fallback) => settings[key] ?? fallback, set: (key, value) => { settings[key] = value; } };
  } };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
  await context.module.exports.execute({ sendMessage: async (jid, content) => sent.push(content.text) },
    { key: { remoteJid: '1@s.whatsapp.net', fromMe: true } }, ['on']);
  assert.equal(settings.antilinkall, true);
  assert.match(sent[0], /ENABLED/);
});
