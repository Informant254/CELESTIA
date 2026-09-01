const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'pdm',
  description: 'Toggle promote/demote notifications. Usage: .pdm on/off',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const mode = args[0]?.toLowerCase();
    if (mode !== 'on' && mode !== 'off') {
      return sock.sendMessage(jid, { text: '❌ Usage: .pdm on  or  .pdm off' }, { quoted: msg });
    }

    groupSettingsStore.set(jid, 'pdm', mode === 'on');
    await sock.sendMessage(jid, { text: `📢 Promote/demote notifications turned ${mode}.` }, { quoted: msg });
  }
};
