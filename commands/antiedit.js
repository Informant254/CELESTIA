const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'antiedit',
  description: 'Controls revealing edited messages. Usage: .antiedit on|off|g|p',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const mode = (args[0] || '').toLowerCase();

    if (!['on', 'off', 'g', 'p'].includes(mode)) {
      const current = settingsStore.get('antiedit', false);
      const dest = settingsStore.get('antieditDest', 'p');
      return sock.sendMessage(
        jid,
        {
          text: `✏️ Antiedit is currently *${current ? 'ON' : 'OFF'}*, sending to *${dest === 'g' ? 'original chat' : 'bot DM'}*.\n\nUsage:\n.antiedit on | off\n.antiedit g (reveal in original chat)\n.antiedit p (reveal in bot DM)`,
        },
        { quoted: msg }
      );
    }

    if (mode === 'on') {
      settingsStore.set('antiedit', true);
      return sock.sendMessage(jid, { text: '✏️ Antiedit is now *ON*.' }, { quoted: msg });
    }

    if (mode === 'off') {
      settingsStore.set('antiedit', false);
      return sock.sendMessage(jid, { text: '✏️ Antiedit is now *OFF*.' }, { quoted: msg });
    }

    if (mode === 'g' || mode === 'p') {
      settingsStore.set('antiedit', true);
      settingsStore.set('antieditDest', mode);
      const destLabel = mode === 'g' ? 'the original chat' : "the bot's own DM";
      return sock.sendMessage(jid, { text: `✏️ Antiedit is now *ON*, sending to *${destLabel}*.` }, { quoted: msg });
    }
  },
};
