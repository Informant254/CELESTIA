const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const groupSettingsStore = require('../utils/groupSettingsStore');
const greeter = require('../utils/greeter');

const GROUP = '120363011111111111@g.us';
const NEWBIE = '254711111111@s.whatsapp.net';

function fakeSock(sent, subject = 'Test Group') {
  return {
    groupMetadata: async () => ({ id: GROUP, subject }),
    sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 's' } }; },
  };
}

function saveRestore() {
  const prevMaster = settingsStore.get('welcomegoodbye', undefined);
  const prevGroup = groupSettingsStore.getAll(GROUP);
  return () => {
    settingsStore.set('welcomegoodbye', prevMaster);
    for (const k of Object.keys(groupSettingsStore.getAll(GROUP))) {
      groupSettingsStore.set(GROUP, k, prevGroup[k]);
    }
    settingsStore.flush();
    groupSettingsStore.flush();
  };
}

const addEvent = { id: GROUP, action: 'add', participants: [NEWBIE] };
const removeEvent = { id: GROUP, action: 'remove', participants: [NEWBIE] };

test('welcome fires on per-group flag alone (no master needed)', async () => {
  const restore = saveRestore();
  try {
    settingsStore.set('welcomegoodbye', undefined);
    groupSettingsStore.set(GROUP, 'welcome', true);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), addEvent);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content.text, /Welcome/);
    assert.match(sent[0].content.text, /Test Group/);
    assert.deepEqual(sent[0].content.mentions, [NEWBIE]);
  } finally { restore(); }
});

test('explicit master OFF silences welcomes (kill switch)', async () => {
  const restore = saveRestore();
  try {
    settingsStore.set('welcomegoodbye', false);
    groupSettingsStore.set(GROUP, 'welcome', true);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), addEvent);
    assert.equal(sent.length, 0);
  } finally { restore(); }
});

test('goodbye fires on remove when enabled', async () => {
  const restore = saveRestore();
  try {
    settingsStore.set('welcomegoodbye', undefined);
    groupSettingsStore.set(GROUP, 'goodbye', true);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), removeEvent);
    assert.equal(sent.length, 1);
    assert.match(sent[0].content.text, /has left/);
    assert.ok(!/idiot/i.test(sent[0].content.text), 'no hostile wording');
  } finally { restore(); }
});

test('nothing sent when per-group flags are off', async () => {
  const restore = saveRestore();
  try {
    settingsStore.set('welcomegoodbye', undefined);
    groupSettingsStore.set(GROUP, 'welcome', false);
    groupSettingsStore.set(GROUP, 'goodbye', false);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), addEvent);
    await greeter.handleParticipantsUpdate(fakeSock(sent), removeEvent);
    assert.equal(sent.length, 0);
  } finally { restore(); }
});

test('setgreet sends the branded greeting on add', async () => {
  const restore = saveRestore();
  try {
    groupSettingsStore.set(GROUP, 'setgreet', true);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), addEvent);
    assert.ok(sent.some((s) => /CELESTIA/.test(s.content.text)));
  } finally { restore(); }
});

test('promote announces the crowning with mentions', async () => {
  const restore = saveRestore();
  try {
    groupSettingsStore.set(GROUP, 'pdm', true);
    const sent = [];
    await greeter.handleParticipantsUpdate(fakeSock(sent), {
      id: GROUP, action: 'promote', author: '254722222222@s.whatsapp.net', participants: [NEWBIE],
    });
    assert.equal(sent.length, 1);
    assert.match(sent[0].content.text, /crowned/);
    assert.deepEqual(sent[0].content.mentions, [NEWBIE, '254722222222@s.whatsapp.net']);
  } finally { restore(); }
});
