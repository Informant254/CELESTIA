const { test } = require('node:test');
const assert = require('node:assert/strict');
const kick = require('../commands/kick');
const { resolveGroupTargets } = require('../utils/jidResolver');

const GROUP = '120363000000000000@g.us';
const ADMIN_PN = '254700000001@s.whatsapp.net';
const BOT_PN = '254700000002@s.whatsapp.net';
const TARGET_PN = '254700000003@s.whatsapp.net';
const TARGET_LID = '333333333333333@lid';

function metadata() {
  return {
    subject: 'Test group',
    participants: [
      { id: '111111111111111@lid', lid: '111111111111111@lid', phoneNumber: ADMIN_PN, admin: 'admin' },
      { id: '222222222222222@lid', lid: '222222222222222@lid', phoneNumber: BOT_PN, admin: 'admin' },
      { id: TARGET_LID, lid: TARGET_LID, phoneNumber: TARGET_PN, admin: null },
    ],
  };
}

function message(content) {
  return {
    key: { remoteJid: GROUP, participant: '111111111111111@lid', participantPn: ADMIN_PN, fromMe: false },
    message: content,
  };
}

function fakeSock(sent, updates) {
  return {
    user: { id: '254700000002:9@s.whatsapp.net', lid: '222222222222222@lid' },
    groupMetadata: async () => metadata(),
    groupParticipantsUpdate: async (jid, targets, action) => {
      updates.push({ jid, targets, action });
      return [{ status: '200' }];
    },
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
}

test('group resolver handles replies, PN mentions, wrappers, and typed numbers', () => {
  const replied = resolveGroupTargets(metadata(), message({
    extendedTextMessage: { text: '.kick', contextInfo: { participant: TARGET_LID } },
  }));
  assert.equal(replied[0].jid, TARGET_LID);
  assert.equal(replied[0].phoneJid, TARGET_PN);

  const wrapped = resolveGroupTargets(metadata(), message({
    ephemeralMessage: { message: {
      extendedTextMessage: { text: '.kick', contextInfo: { mentionedJid: [TARGET_PN] } },
    } },
  }));
  assert.equal(wrapped[0].jid, TARGET_LID);

  const typed = resolveGroupTargets(metadata(), message({ conversation: '.kick 254700000003' }), ['+254 700 000 003']);
  assert.equal(typed[0].jid, TARGET_LID);
});

test('explicit mention wins over the replied participant', () => {
  const secondLid = '444444444444444@lid';
  const secondPn = '254700000004@s.whatsapp.net';
  const group = metadata();
  group.participants.push({ id: secondLid, lid: secondLid, phoneNumber: secondPn });
  const targets = resolveGroupTargets(group, message({
    extendedTextMessage: {
      text: '.promote @second',
      contextInfo: { participant: TARGET_LID, mentionedJid: [secondPn] },
    },
  }));
  assert.equal(targets[0].jid, secondLid);
  assert.equal(targets[1].jid, TARGET_LID);
});

test('kick removes the replied LID-addressed participant', async () => {
  const sent = [];
  const updates = [];
  const msg = message({
    ephemeralMessage: { message: {
      extendedTextMessage: { text: '.kick', contextInfo: { participant: TARGET_LID } },
    } },
  });
  await kick.execute(fakeSock(sent, updates), msg, []);
  assert.deepEqual(updates, [{ jid: GROUP, targets: [TARGET_LID], action: 'remove' }]);
  assert.ok(sent.some((entry) => entry.content.mentions?.includes(TARGET_LID)));
});

test('kick accepts a typed number and only asks for a target when none exists', async () => {
  const sent = [];
  const updates = [];
  const sock = fakeSock(sent, updates);
  await kick.execute(sock, message({ conversation: '.kick 254700000003' }), ['254700000003']);
  assert.equal(updates[0].targets[0], TARGET_LID);

  sent.length = 0;
  updates.length = 0;
  await kick.execute(sock, message({ conversation: '.kick' }), []);
  assert.equal(updates.length, 0);
  assert.match(sent.at(-1).content.text, /Reply, mention, or provide/);
});
