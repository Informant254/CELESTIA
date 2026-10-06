const { test } = require('node:test');
const assert = require('node:assert/strict');
const statusCmd = require('../commands/status');
const whatsappCommands = require('../commands/whatsapp');
const { noteStatusContacts, noteStatusMessage } = require('../utils/mediaStudio');

const DM = '254700000099@s.whatsapp.net';

function statusSock(sent, extra = {}) {
  return {
    user: { id: '254700000099:4@s.whatsapp.net' },
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `m${sent.length}` } };
    },
    ...extra,
  };
}

function dmTextMsg(text = '.status Hello there') {
  return { key: { remoteJid: DM, fromMe: true }, message: { conversation: text } };
}

test('personal status registers as status with reference aliases; bio lookup moved to bio', () => {
  assert.equal(statusCmd.name, 'status');
  assert.deepEqual(statusCmd.aliases, ['pstatus', 'mystatus', 'personalstatus', 'story']);
  assert.ok(whatsappCommands.find((c) => c.name === 'bio'));
  assert.equal(whatsappCommands.find((c) => c.name === 'status'), undefined);
});

test('status refuses non-owners', async () => {
  const sent = [];
  const sock = statusSock(sent);
  const msg = {
    key: { remoteJid: DM, participant: '254700000001@s.whatsapp.net', fromMe: false },
    message: { conversation: '.status hi' },
  };
  await statusCmd.execute(sock, msg, ['hi']);
  assert.equal(sent.some((e) => e.jid === 'status@broadcast'), false);
  assert.match(sent.at(-1).content.text, /Only the CELESTIA owner/);
});

test('status shows usage when there is nothing to post', async () => {
  const sent = [];
  const sock = statusSock(sent);
  await statusCmd.execute(sock, dmTextMsg('.status'), []);
  assert.equal(sent.some((e) => e.jid === 'status@broadcast'), false);
  assert.match(sent.at(-1).content.text, /CELESTIA PERSONAL STATUS/);
});

test('status publishes text to contacts from the socket contact store', async () => {
  const sent = [];
  const sock = statusSock(sent, {
    store: { contacts: { '254700000001@s.whatsapp.net': {}, '254700000002@s.whatsapp.net': {} } },
  });
  await statusCmd.execute(sock, dmTextMsg(), ['Hello', 'there']);

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.equal(status.content.text, 'Hello there');
  assert.equal(status.options.broadcast, true);
  assert.equal(status.options.backgroundColor, '#111111');
  assert.equal(status.options.font, 1);
  assert.deepEqual(status.options.statusJidList.sort(), [
    '254700000001@s.whatsapp.net',
    '254700000002@s.whatsapp.net',
    '254700000099@s.whatsapp.net',
  ].sort());
  assert.match(sent.at(-1).content.text, /3 recipient/);
});

test('status uses CELESTIA synced contacts when no store is exposed', async () => {
  const sent = [];
  const sock = statusSock(sent);
  noteStatusContacts(sock, [{ id: '254700000001@s.whatsapp.net' }, { id: '254700000002@s.whatsapp.net' }]);
  await statusCmd.execute(sock, dmTextMsg(), ['Synced', 'contacts']);

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.equal(status.content.text, 'Synced contacts');
  assert.equal(status.options.statusJidList.length, 3);
});

test('status uses CELESTIA_STATUS_JIDS env fallback', async () => {
  const sent = [];
  const sock = statusSock(sent);
  const prev = process.env.CELESTIA_STATUS_JIDS;
  process.env.CELESTIA_STATUS_JIDS = '254700000003@s.whatsapp.net, 254700000004@s.whatsapp.net';
  try {
    await statusCmd.execute(sock, dmTextMsg(), ['Env', 'contacts']);
  } finally {
    if (prev === undefined) delete process.env.CELESTIA_STATUS_JIDS;
    else process.env.CELESTIA_STATUS_JIDS = prev;
  }

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.deepEqual(status.options.statusJidList.sort(), [
    '254700000003@s.whatsapp.net',
    '254700000004@s.whatsapp.net',
    '254700000099@s.whatsapp.net',
  ].sort());
});

test('status refuses honestly when no contacts are available', async () => {
  const sent = [];
  const sock = statusSock(sent);
  await statusCmd.execute(sock, dmTextMsg(), ['Nobody', 'here']);

  assert.equal(sent.some((e) => e.jid === 'status@broadcast'), false);
  assert.match(sent.at(-1).content.text, /does not know any personal Status recipients/);
  assert.doesNotMatch(sent.at(-1).content.text, /sock\.|global\.store/);
});

test('status learns recipients from synced history and live message identities', async () => {
  const sent = [];
  const sock = statusSock(sent);
  noteStatusMessage(sock, {
    key: {
      remoteJid: '123456789012345@lid',
      remoteJidAlt: '254700000001@s.whatsapp.net',
      fromMe: false,
    },
  }, { persist: false });
  noteStatusMessage(sock, {
    key: {
      remoteJid: '120363000000000000@g.us',
      participant: '234567890123456@lid',
      participantPn: '254700000002@s.whatsapp.net',
      fromMe: false,
    },
  }, { persist: false });

  await statusCmd.execute(sock, dmTextMsg(), ['Learned', 'audience']);

  const status = sent.find((entry) => entry.jid === 'status@broadcast');
  assert.deepEqual(status.options.statusJidList.sort(), [
    '254700000001@s.whatsapp.net',
    '254700000002@s.whatsapp.net',
    '254700000099@s.whatsapp.net',
  ].sort());
});

test('status stays LID-only for LID-based accounts', async () => {
  const sent = [];
  const sock = statusSock(sent, {
    user: { id: '254700000099:4@s.whatsapp.net', lid: '999999999999999@lid' },
    store: { contacts: [{ id: '111111111111111@lid' }, { id: '222222222222222@lid' }] },
  });
  await statusCmd.execute(sock, dmTextMsg(), ['LID', 'only']);

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.deepEqual(status.options.statusJidList.sort(), [
    '111111111111111@lid',
    '222222222222222@lid',
    '999999999999999@lid',
  ].sort());
});

test('status freshly uploads replied images with captions', async () => {
  const sent = [];
  const sock = statusSock(sent, {
    store: { contacts: { '254700000001@s.whatsapp.net': {}, '254700000002@s.whatsapp.net': {} } },
  });
  const msg = {
    key: { remoteJid: DM, fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.status New caption',
        contextInfo: {
          stanzaId: 'img1',
          quotedMessage: { imageMessage: { caption: 'Old', mimetype: 'image/jpeg', width: 100, height: 100 } },
        },
      },
    },
  };
  const original = statusCmd.downloadSourceMedia;
  statusCmd.downloadSourceMedia = async () => Buffer.from('fresh image');
  try {
    await statusCmd.execute(sock, msg, ['New', 'caption']);
  } finally {
    statusCmd.downloadSourceMedia = original;
  }

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.equal(status.content.image.toString(), 'fresh image');
  assert.equal(status.content.caption, 'New caption');
  assert.match(sent.at(-1).content.text, /3 recipient/);
});

test('status converts music through the shared Opus path with audio styling', async () => {
  const sent = [];
  const sock = statusSock(sent, {
    store: { contacts: { '254700000001@s.whatsapp.net': {}, '254700000002@s.whatsapp.net': {} } },
  });
  const msg = {
    key: { remoteJid: DM, fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.status',
        contextInfo: { stanzaId: 'aud1', quotedMessage: { audioMessage: { mimetype: 'audio/mpeg' } } },
      },
    },
  };
  const originalDownload = statusCmd.downloadSourceMedia;
  const originalPrepare = statusCmd.prepareStatusAudio;
  statusCmd.downloadSourceMedia = async () => Buffer.from('song bytes');
  statusCmd.prepareStatusAudio = async () => ({ audio: Buffer.from('opus bytes'), mimetype: 'audio/ogg; codecs=opus', ptt: true, seconds: 60 });
  try {
    await statusCmd.execute(sock, msg, []);
  } finally {
    statusCmd.downloadSourceMedia = originalDownload;
    statusCmd.prepareStatusAudio = originalPrepare;
  }

  const status = sent.find((e) => e.jid === 'status@broadcast');
  assert.equal(status.content.audio.toString(), 'opus bytes');
  assert.equal(status.options.backgroundColor, '#000000');
});

test('status refuses raw stickers without a silent failure', async () => {
  const sent = [];
  const sock = statusSock(sent, {
    store: { contacts: { '254700000001@s.whatsapp.net': {}, '254700000002@s.whatsapp.net': {} } },
  });
  const msg = {
    key: { remoteJid: DM, fromMe: true },
    message: {
      extendedTextMessage: {
        text: '.status',
        contextInfo: { stanzaId: 'stk1', quotedMessage: { stickerMessage: { mimetype: 'image/webp' } } },
      },
    },
  };
  const original = statusCmd.downloadSourceMedia;
  statusCmd.downloadSourceMedia = async () => Buffer.from('sticker bytes');
  try {
    await statusCmd.execute(sock, msg, []);
  } finally {
    statusCmd.downloadSourceMedia = original;
  }

  assert.equal(sent.some((e) => e.jid === 'status@broadcast'), false);
  assert.match(sent.at(-1).content.text, /sticker/i);
});
