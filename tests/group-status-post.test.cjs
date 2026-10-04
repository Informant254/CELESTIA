const { test } = require('node:test');
const assert = require('node:assert/strict');
const groupPost = require('../commands/grouppost');
const gstatus = require('../commands/groupsecurity').find((command) => command.name === 'gstatus');
const setStatus = require('../commands/whatsapp').find((command) => command.name === 'setstatus');
const { groupStatusJids } = require('../utils/mediaStudio');

const GROUP = '120363000000000000@g.us';
const metadata = {
  participants: [
    { id: '111111111111111@lid', phoneNumber: '254700000001@s.whatsapp.net' },
    { id: '254700000002@s.whatsapp.net' },
    { id: '333333333333333@lid' },
  ],
};

test('group status audience resolves PN identities and counts LID-only skips', async () => {
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    groupMetadata: async () => metadata,
  };
  const result = await groupStatusJids(sock, GROUP);
  assert.deepEqual(result.jids.sort(), [
    '254700000001@s.whatsapp.net',
    '254700000002@s.whatsapp.net',
    '254700000099@s.whatsapp.net',
  ].sort());
  assert.equal(result.resolved, 2);
  assert.equal(result.skipped, 1);
});

test('setstatus includes PN identities for LID-addressed shared-group members', async () => {
  const sent = [];
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    groupFetchAllParticipating: async () => ({ [GROUP]: metadata }),
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
  const msg = {
    key: { remoteJid: '254700000099@s.whatsapp.net', fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.setstatus',
        contextInfo: { quotedMessage: { conversation: 'LID-safe status' }, stanzaId: 'q1' },
      },
    },
  };
  await setStatus.execute(sock, msg, []);
  const status = sent.find((entry) => entry.jid === 'status@broadcast');
  assert.ok(status.options.statusJidList.includes('254700000001@s.whatsapp.net'));
  assert.ok(status.options.statusJidList.includes('254700000002@s.whatsapp.net'));
});

test('grouppost publishes text inside the group chat', async () => {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: { conversation: '.grouppost Exam starts Monday' },
  };
  await groupPost.execute(sock, msg, ['Exam', 'starts', 'Monday']);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, GROUP);
  assert.match(sent[0].content.text, /GROUP STATUS/);
  assert.match(sent[0].content.text, /Exam starts Monday/);
  assert.ok(!sent.some((entry) => entry.jid === 'status@broadcast'), 'must not touch the Status tab');
});

test('grouppost reposts replied text inside the group, including wrapped replies', async () => {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: {
      ephemeralMessage: { message: {
        extendedTextMessage: {
          text: '.grouppost',
          contextInfo: { quotedMessage: { conversation: 'Wrapped hello' }, stanzaId: 'q1' },
        },
      } },
    },
  };
  await groupPost.execute(sock, msg, []);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].jid, GROUP);
  assert.match(sent[0].content.text, /Wrapped hello/);
});

test('grouppost shows usage when there is nothing to post', async () => {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: { conversation: '.grouppost' },
  };
  await groupPost.execute(sock, msg, []);
  assert.match(sent.at(-1).content.text, /Usage/);
});

test('gstatus posts text inside the group, including wrapped replies', async () => {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
  const direct = {
    key: { remoteJid: GROUP, participant: '111111111111111@lid', fromMe: false },
    message: { conversation: '.gstatus Hello group' },
  };
  await gstatus.execute(sock, direct, ['Hello', 'group']);
  assert.match(sent.at(-1).content.text, /Hello group/);

  sent.length = 0;
  const wrapped = {
    key: { remoteJid: GROUP, participant: '111111111111111@lid', fromMe: false },
    message: {
      ephemeralMessage: { message: {
        extendedTextMessage: {
          text: '.gstatus',
          contextInfo: { quotedMessage: { conversation: 'Wrapped status' }, stanzaId: 'q2' },
        },
      } },
    },
  };
  await gstatus.execute(sock, wrapped, []);
  assert.match(sent.at(-1).content.text, /Wrapped status/);
});
