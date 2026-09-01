const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

// Hardcoded owner/developer numbers — protected from being blocked
const OWNER_NUMBERS = [
  '254718701810@s.whatsapp.net',
  '254754574642@s.whatsapp.net',
];

module.exports = {
  name: 'block',
  description: 'Block a user (owner only). Usage: .block @user / .block (reply) / .block 2547xxxxxxxx',
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
        { text: '❌ *Tag someone, reply to their message, or provide a number.*\nUsage: .block @user / .block 2547xxxxxxxx' },
        { quoted: msg }
      );
    }

    const botJid = jidNormalizedUser(sock.user.id);

    if (OWNER_NUMBERS.includes(target)) {
      return sock.sendMessage(jid, { text: '*I cannot block my Owner 😡*' }, { quoted: msg });
    }
    if (target === botJid) {
      return sock.sendMessage(jid, { text: '*I cannot block myself 😡*' }, { quoted: msg });
    }

    try {
      await sock.updateBlockStatus(target, 'block');
      await sock.sendMessage(jid, { text: `✅ *+${target.split('@')[0]}* has been blocked.` }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ *Error: ${err.message}*` }, { quoted: msg });
    }
  },
};
