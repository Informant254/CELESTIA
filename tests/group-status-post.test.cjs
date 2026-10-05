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

function groupStatusSock(sent, relayed) {
  return {
    user: { id: '254700000099:4@s.whatsapp.net' },
    sendGroupStatus: async (jid, content) => {
      relayed.push({ jid, content });
      return { key: { id: `gs${relayed.length}` } };
    },
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
  };
}

test('grouppost relays a real groupStatusMessageV2 for text', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: { conversation: '.grouppost Exam starts Monday' },
  };
  await groupPost.execute(sock, msg, ['Exam', 'starts', 'Monday']);

  assert.equal(sent.length, 0, 'must not claim success with a normal chat message');
  assert.equal(relayed.length, 1);
  assert.equal(relayed[0].jid, GROUP);
  assert.equal(relayed[0].content.text, 'Exam starts Monday');
});

test('grouppost relays replied text as a group status, including wrapped replies', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
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

  assert.equal(sent.length, 0);
  assert.equal(relayed[0].content.text, 'Wrapped hello');
});

test('grouppost downloads and freshly uploads replied image media', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.grouppost New caption',
        contextInfo: {
          stanzaId: 'media1',
          quotedMessage: {
            imageMessage: {
              url: 'https://expired.invalid/image',
              directPath: '/v/t62/example',
              mediaKey: Buffer.alloc(32, 1),
              caption: 'Old caption',
              jpegThumbnail: Buffer.from([1, 2, 3]),
              width: 100,
              height: 100,
            },
          },
        },
      },
    },
  };
  const originalDownload = groupPost.downloadSourceMedia;
  let downloaded = false;
  groupPost.downloadSourceMedia = async () => {
    downloaded = true;
    return Buffer.from('fresh image bytes');
  };
  try {
    await groupPost.execute(sock, msg, ['New', 'caption']);
  } finally {
    groupPost.downloadSourceMedia = originalDownload;
  }

  assert.equal(downloaded, true);
  assert.equal(sent.length, 0);
  assert.equal(relayed[0].content.image.toString(), 'fresh image bytes');
  assert.equal(relayed[0].content.caption, 'New caption');
});

test('gstatus freshly uploads replied music as an audio group status', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
  const msg = {
    key: { remoteJid: GROUP, fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.gstatus',
        contextInfo: {
          stanzaId: 'audio1',
          quotedMessage: {
            audioMessage: { mimetype: 'audio/mpeg', seconds: 180, ptt: false },
          },
        },
      },
    },
  };
  const originalDownload = groupPost.downloadSourceMedia;
  groupPost.downloadSourceMedia = async () => Buffer.from('fresh audio bytes');
  try {
    await gstatus.execute(sock, msg, []);
  } finally {
    groupPost.downloadSourceMedia = originalDownload;
  }

  assert.equal(relayed[0].content.audio.toString(), 'fresh audio bytes');
  assert.equal(relayed[0].content.mimetype, 'audio/mpeg');
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
  assert.match(sent.at(-1).content.text, /CELESTIA GROUP STATUS/);
});

test('gstatus posts text inside the group, including wrapped replies', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
  const direct = {
    key: { remoteJid: GROUP, participant: '111111111111111@lid', fromMe: true },
    message: { conversation: '.gstatus Hello group' },
  };
  await gstatus.execute(sock, direct, ['Hello', 'group']);
  assert.equal(relayed.at(-1).content.text, 'Hello group');

  relayed.length = 0;
  const wrapped = {
    key: { remoteJid: GROUP, participant: '111111111111111@lid', fromMe: true },
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
  assert.equal(relayed.at(-1).content.text, 'Wrapped status');
});

test('grouppost refuses non-owner group members', async () => {
  const sent = [];
  const relayed = [];
  const sock = groupStatusSock(sent, relayed);
  const msg = {
    key: { remoteJid: GROUP, participant: '254700000001@s.whatsapp.net', fromMe: false },
    message: { conversation: '.grouppost denied' },
  };
  await groupPost.execute(sock, msg, ['denied']);
  assert.equal(relayed.length, 0);
  assert.match(sent.at(-1).content.text, /Only the CELESTIA owner/);
});

test('group status aliases remain registered', () => {
  assert.deepEqual(groupPost.aliases, ['gpoststatus', 'groupstory']);
  assert.deepEqual(gstatus.aliases, ['gas', 'gps']);
});

test('CELESTIA uses the wolfsocket group-status transport', () => {
  const transport = require('@whiskeysockets/baileys/package.json');
  assert.equal(transport.name, 'wolfsocket');
  assert.equal(transport.version, '1.0.1');
});
