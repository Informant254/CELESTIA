const { isOwner } = require('../utils/isOwner');
const { resolvePhoneJid } = require('../utils/jidResolver');

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

    // LID mentions must be resolved to the real phone JID before acting on them.
    try {
      const resolved = await resolvePhoneJid(sock, msg, target);
      if (resolved?.resolved) target = resolved.jid;
    } catch { /* keep the original jid */ }

    const label = String(target).endsWith('@lid') ? 'the selected user' : `+${target.split('@')[0]}`;

    try {
      await sock.updateBlockStatus(target, 'unblock');
      await sock.sendMessage(jid, { text: `✅ *${label}* has been unblocked.` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ *Error: ${err.message}*` }, { quoted: msg });
    }
  },
};
