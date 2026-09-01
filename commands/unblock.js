const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'unblock',
  description: 'Unblock a user (owner only). Usage: .unblock @user / .unblock (reply) / .unblock 2547xxxxxxxx',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let target = ctx?.mentionedJid?.[0] || ctx?.participant || null;

    if (!target && args[0]) {
      const num = args[0].replace(/[^0-9]/g, '');
      if (num) target = `${num}@s.whatsapp.net`;
    }

    if (!target) {
      return sock.sendMessage(
        jid,
        { text: '❌ *Tag someone, reply to their message, or provide a number.*\nUsage: .unblock @user / .unblock 2547xxxxxxxx' },
        { quoted: msg }
      );
    }

    try {
      await sock.updateBlockStatus(target, 'unblock');
      await sock.sendMessage(jid, { text: `✅ *+${target.split('@')[0]}* has been unblocked.` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ *Error: ${err.message}*` }, { quoted: msg });
    }
  },
};
