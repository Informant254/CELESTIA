const { isOwner } = require('../utils/isOwner');
const { listSudo } = require('../utils/isSudo');

module.exports = {
  name: 'checksudo',
  aliases: ['sudos'],
  description: 'Lists all sudo users (owner only).',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    const list = listSudo();

    if (!list.length) {
      return sock.sendMessage(jid, {
        text: '📋 *No sudo users set.*\n\nUse .addsudo @user to add one.',
      }, { quoted: msg });
    }

    const formatted = list
      .map((n, i) => `${i + 1}. +${n}`)
      .join('\n');

    await sock.sendMessage(jid, {
      text:
        `══════════════════\n` +
        `  *CURRENT SUDO USERS*\n` +
        `══════════════════\n\n` +
        `${formatted}\n\n` +
        `*Total: ${list.length}*`,
    }, { quoted: msg });
  },
};
