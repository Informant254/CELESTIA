const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

async function setEphemeral(sock, msg, seconds, label) {
  const jid = msg.key.remoteJid;

  if (!jid.endsWith('@g.us')) {
    return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
  }

  const metadata = await sock.groupMetadata(jid);
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!isSenderAdmin(metadata, senderJid)) {
    return sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' }, { quoted: msg });
  }
  if (!isBotAdmin(sock, metadata)) {
    return sock.sendMessage(jid, { text: '❌ I need to be a group admin to change this setting.' }, { quoted: msg });
  }

  try {
    await sock.groupToggleEphemeral(jid, seconds);
    await sock.sendMessage(jid, { text: `⏳ Disappearing messages set to *${label}*.` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Failed to update: ' + e.message }, { quoted: msg });
  }
}

module.exports = [
  {
    name: 'disp-1',
    description: 'Set disappearing messages to 24 hours (admin only).',
    async execute(sock, msg) {
      await setEphemeral(sock, msg, 86400, '24 hours');
    },
  },
  {
    name: 'disp-7',
    description: 'Set disappearing messages to 7 days (admin only).',
    async execute(sock, msg) {
      await setEphemeral(sock, msg, 604800, '7 days');
    },
  },
  {
    name: 'disp-90',
    description: 'Set disappearing messages to 90 days (admin only).',
    async execute(sock, msg) {
      await setEphemeral(sock, msg, 7776000, '90 days');
    },
  },
  {
    name: 'disp-off',
    description: 'Turn off disappearing messages (admin only).',
    async execute(sock, msg) {
      await setEphemeral(sock, msg, 0, 'OFF');
    },
  },
];
