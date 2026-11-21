const test = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const groupSettingsStore = require('../utils/groupSettingsStore');

const GROUP = '120363999999999999@g.us';
const BOT_LID = '111122223333444455';
const OWNER_LID = '555566667777888899';
const ADMIN_LID = '999900001111222233';
const TARGET_LID = '444433332222111100';

function withGroupFlag(fn) {
  return async () => {
    const prev = groupSettingsStore.getAll(GROUP);
    const prevOwnerLid = settingsStore.get('ownerLid', '');
    try {
      await fn();
    } finally {
      for (const k of Object.keys(groupSettingsStore.getAll(GROUP))) {
        groupSettingsStore.set(GROUP, k, prev[k]);
      }
      settingsStore.set('ownerLid', prevOwnerLid);
      groupSettingsStore.flush();
      settingsStore.flush();
    }
  };
}

function sockMock(calls, participants) {
  return {
    user: { id: '254899999999@s.whatsapp.net' },
    groupMetadata: async () => ({ id: GROUP, subject: 'Audit Group', participants }),
    groupParticipantsUpdate: async (jid, jids, action) => {
      calls.push({ jid, target: jids[0], action });
      return [{ status: 200 }];
    },
    sendMessage: async () => ({ key: { id: 's' } }),
  };
}

test('anti-name never kicks on fromMe messages', withGroupFlag(async () => {
  const antiname = require('../utils/antiname');
  groupSettingsStore.set(GROUP, 'antiname', true);
  const calls = [];
  const sock = sockMock(calls, [{ id: `${TARGET_LID}@lid` }]);
  const msg = { key: { remoteJid: GROUP, participant: `${TARGET_LID}@lid`, fromMe: true }, pushName: 'Queen Sofia' };
  assert.equal(await antiname.checkMessage(sock, msg), false);
  assert.equal(calls.length, 0);
}));

test('anti-name protects the owner/bot by LID even when the name matches', withGroupFlag(async () => {
  const antiname = require('../utils/antiname');
  groupSettingsStore.set(GROUP, 'antiname', true);
  settingsStore.set('ownerLid', OWNER_LID);
  const calls = [];
  const sock = sockMock(calls, [{ id: `${OWNER_LID}@lid`, admin: 'admin' }]);
  const msg = { key: { remoteJid: GROUP, participant: `${OWNER_LID}@lid`, fromMe: false }, pushName: 'Queen Sofia' };
  assert.equal(await antiname.checkMessage(sock, msg), false);
  assert.equal(calls.length, 0);
}));

test('anti-name still removes an admin carrying the banned name (demote first)', withGroupFlag(async () => {
  const antiname = require('../utils/antiname');
  groupSettingsStore.set(GROUP, 'antiname', true);
  settingsStore.set('ownerLid', BOT_LID);
  const calls = [];
  const sock = sockMock(calls, [
    { id: `${BOT_LID}@lid`, admin: 'admin' },
    { id: `${ADMIN_LID}@lid`, admin: 'admin' },
  ]);
  const msg = { key: { remoteJid: GROUP, participant: `${ADMIN_LID}@lid`, fromMe: false }, pushName: 'Queen Sofia' };
  assert.equal(await antiname.checkMessage(sock, msg), true);
  assert.deepEqual(calls.map((c) => c.action), ['demote', 'remove']);
}));

test('anti-name join path protects LID identities too', withGroupFlag(async () => {
  const antiname = require('../utils/antiname');
  groupSettingsStore.set(GROUP, 'antiname', true);
  settingsStore.set('ownerLid', BOT_LID);
  const calls = [];
  const sock = sockMock(calls, [{ id: `${BOT_LID}@lid`, admin: 'admin' }]);
  await antiname.handleEvent(sock, {
    id: GROUP,
    action: 'add',
    participants: [{ id: `${BOT_LID}@lid`, name: 'Queen Sofia' }],
  });
  assert.equal(calls.length, 0);
}));

test('foreigners never flags unresolvable LIDs as foreign', async () => {
  const foreigners = require('../commands/foreigners.js');
  const sent = [];
  const metadata = {
    participants: [
      { id: '254700000000@s.whatsapp.net' },
      { id: '111122223333444455@lid' },
      { id: '222233334444555566@lid', phoneNumber: '254711111111@s.whatsapp.net' },
      { id: '333344445555666677@lid', phoneNumber: '447700900123@s.whatsapp.net' },
    ],
  };
  const sock = {
    groupMetadata: async () => metadata,
    sendMessage: async (jid, content) => { sent.push(content); return {}; },
  };
  await foreigners.execute(sock, { key: { remoteJid: GROUP } }, []);
  const content = sent.at(-1);
  assert.match(content.text, /@447700900123/);
  assert.doesNotMatch(content.text, /111122223333444455/);
  assert.doesNotMatch(content.text, /222233334444555566/);
  assert.deepEqual(content.mentions, ['447700900123@s.whatsapp.net']);
});

test('vcf exports resolvable phone numbers and skips hidden LIDs', async () => {
  const vcf = require('../commands/vcf.js');
  const sent = [];
  const metadata = {
    subject: 'Audit Group',
    participants: [
      { id: '254700000000@s.whatsapp.net' },
      { id: '111122223333444455@lid' },
      { id: '333344445555666677@lid', phoneNumber: '447700900123@s.whatsapp.net' },
    ],
  };
  const sock = {
    groupMetadata: async () => metadata,
    sendMessage: async (jid, content) => { sent.push(content); return {}; },
  };
  await vcf.execute(sock, { key: { remoteJid: GROUP } });
  const content = sent.at(-1);
  const text = content.document.toString('utf8');
  assert.match(text, /\+254700000000/);
  assert.match(text, /\+447700900123/);
  assert.doesNotMatch(text, /111122223333444455/);
  assert.match(content.caption, /2 contacts exported/);
  assert.match(content.caption, /1 hidden number/);
});

test('oadmin recognises the bot admin when metadata lists it by LID', withGroupFlag(async () => {
  const oadmin = require('../commands/oadmin.js');
  settingsStore.set('ownerLid', BOT_LID);
  const calls = [];
  const sent = [];
  const sock = {
    user: { id: '254899999999@s.whatsapp.net' },
    groupMetadata: async () => ({
      id: GROUP,
      participants: [
        { id: `${BOT_LID}@lid`, admin: 'admin' },
        { id: `${OWNER_LID}@lid`, admin: 'admin' },
      ],
    }),
    groupParticipantsUpdate: async (jid, jids, action) => { calls.push({ target: jids[0], action }); return [{ status: 200 }]; },
    sendMessage: async (jid, content) => { sent.push(content); return {}; },
  };
  const msg = { key: { remoteJid: GROUP, participant: `${OWNER_LID}@lid`, fromMe: true } };
  await oadmin.execute(sock, msg);
  assert.deepEqual(calls, [{ target: `${OWNER_LID}@lid`, action: 'promote' }]);
  assert.match(sent.map((s) => s.text || '').join('\n'), /Crowned/);
}));
