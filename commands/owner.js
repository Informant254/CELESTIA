const config = require('../config/config');
const ui = require('../utils/ui');

module.exports = {
  name: 'owner',
  description: "Shows the bot owner's contact info.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const ownerName = 'CELESTIA Owner';
    const ownerNumber = config.ownerNumber; // live from .env — never stale

    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${ownerName}\n` +
      `ORG:CELESTIA BOT;\n` +
      `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
      'END:VCARD';

    const infoText = ui.renderCard('👑 OWNER INFO', [
      ui.renderInfo('🤖', 'Bot', 'CELESTIA'),
      ui.renderInfo('👤', 'Owner', ownerName),
      ui.renderInfo('📱', 'Contact', `+${ownerNumber}`),
    ]);

    await sock.sendMessage(jid, { text: infoText }, { quoted: msg });

    await sock.sendMessage(jid, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }]
      }
    }, { quoted: msg });
  },
};
