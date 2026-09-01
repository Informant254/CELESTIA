const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'groupstatus',
  description: "Shows this group's current settings.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
    }

    const settings = groupSettingsStore.getAll(jid);

    const onOff = (v) => (v ? '✅ ON' : '❌ OFF');

    const text = `⚙️ *Group Settings*\n\n` +
      `┣ Antilink: ${onOff(settings.antilink)}\n` +
      `┣ Welcome: ${onOff(settings.welcome)}\n` +
      `┣ Goodbye: ${onOff(settings.goodbye)}\n` +
      `┣ Anticall: ${onOff(settings.anticall)}\n` +
      `┗ Antiword: ${onOff(settings.antiword)}`;

    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
