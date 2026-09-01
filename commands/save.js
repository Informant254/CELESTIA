/**
 * commands/save.js
 * -------------------
 * Save a replied WhatsApp status update — resends the status's media
 * (or text) into the bot's own private chat so you have a permanent copy.
 * Usage: reply to a forwarded/quoted status with .save
 */
const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'save',
  description: 'Save a replied status to your DM. Usage: reply to a status with .save',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted) {
      return sock.sendMessage(jid, { text: '❌ Reply to a status with .save' }, { quoted: msg });
    }

    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : jid;

    try {
      if (quoted.imageMessage) {
        const media = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );
        await sock.sendMessage(selfJid, { image: media, caption: quoted.imageMessage.caption || '✅ Status saved' });
      } else if (quoted.videoMessage) {
        const media = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );
        await sock.sendMessage(selfJid, { video: media, caption: quoted.videoMessage.caption || '✅ Status saved' });
      } else if (quoted.conversation || quoted.extendedTextMessage?.text) {
        const text = quoted.conversation || quoted.extendedTextMessage.text;
        await sock.sendMessage(selfJid, { text: `💾 *Saved status:*\n\n${text}` });
      } else {
        return sock.sendMessage(jid, { text: '❌ Unsupported status type — only image, video, or text statuses can be saved.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: '✅ Status saved to your DM.' }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Could not save status: ' + e.message }, { quoted: msg });
    }
  },
};
