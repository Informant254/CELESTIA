module.exports = {
  name: 'delete',
  aliases: ['d'],
  description: 'Delete a replied-to message for everyone (admin only).',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(
        jid,
        { text: '❌ This command only works in groups.' },
        { quoted: msg }
      );
      return;
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

    if (!isSenderAdmin(metadata, senderJid)) {
      await sock.sendMessage(
        jid,
        { text: '❌ Only group admins can use this command.' },
        { quoted: msg }
      );
      return;
    }
    if (!isBotAdmin(sock, metadata)) {
      await sock.sendMessage(
        jid,
        { text: '❌ I need to be a group admin to delete messages.' },
        { quoted: msg }
      );
      return;
    }

    const msgType = Object.keys(msg.message || {})[0];
    const contextInfo = msg.message?.[msgType]?.contextInfo || {};
    const quotedMessage = contextInfo.quotedMessage;
    const stanzaId = contextInfo.stanzaId;
    const quotedParticipant = contextInfo.participant;

    if (!quotedMessage || !stanzaId) {
      await sock.sendMessage(
        jid,
        { text: '❌ Reply to the message you want deleted with *.delete*.' },
        { quoted: msg }
      );
      return;
    }

    try {
      await sock.sendMessage(jid, {
        delete: {
          remoteJid: jid,
          fromMe: false,
          id: stanzaId,
          participant: quotedParticipant,
        },
      });
    } catch (error) {
      await sock.sendMessage(
        jid,
        { text: `❌ Failed to delete message: ${error.message}` },
        { quoted: msg }
      );
    }
  },
};
