const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'blocklist',
  description: 'Show blocked contacts (owner only)',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    try {
      const blocked = await sock.fetchBlocklist();

      if (!blocked || blocked.length === 0) {
        return sock.sendMessage(jid, { text: '*You have no blocked contacts.*' }, { quoted: msg });
      }

      let list = `*Blocked Contacts (${blocked.length})*\n\n`;
      blocked.forEach((jidEntry, i) => {
        list += `${i + 1}. +${jidEntry.replace(/@.+/, '')}\n`;
      });

      await sock.sendMessage(jid, { text: list.trim() }, { quoted: msg });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ *Error fetching blocklist: ${err.message}*` }, { quoted: msg });
    }
  },
};
