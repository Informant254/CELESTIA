const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');
const { isDev } = require('../utils/isDev');

module.exports = {
  name: 'getprefix',
  aliases: ['getp', 'prefix'],
  description: 'Shows the current bot prefix.',
  noprefix: ['getprefix', 'getp', 'prefix'],

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (msg.key.fromMe) return;

    if (!isDev(msg, sock)) return;

    const prefix = settingsStore.get('prefix', config.prefix);

    await sock.sendMessage(
      jid,
      {
        text: `Prefix: ${prefix}`
      },
      { quoted: msg }
    );
  }
};

