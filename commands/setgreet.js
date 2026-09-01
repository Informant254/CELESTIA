const groupSettingsStore = require('../utils/groupSettingsStore');
const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'setgreet',
  description: 'Toggle the CELESTIA greeting for new members. Usage: .setgreet on/off',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
    }

    if (!isOwner(msg) && !isSudo(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    const mode = args[0]?.toLowerCase();
    if (mode !== 'on' && mode !== 'off') {
      return sock.sendMessage(jid, { text: '❌ *Usage: .setgreet on  or  .setgreet off*' }, { quoted: msg });
    }

    groupSettingsStore.set(jid, 'setgreet', mode === 'on');
    await sock.sendMessage(jid, { text: `👋 *Greeting turned ${mode.toUpperCase()}.*` }, { quoted: msg });
  }
};
