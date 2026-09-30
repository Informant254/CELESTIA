const ui = require('../utils/ui');

module.exports = {
  name: 'owner',
  description: 'Shows information about the bot owner.',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ownerName = 'CELESTIA Owner';

    const infoText = ui.renderCard('👑 OWNER INFO', [
      ui.renderInfo('🤖', 'Bot', 'CELESTIA'),
      ui.renderInfo('👤', 'Owner', ownerName),
      ui.renderInfo('🔒', 'Contact', 'Private'),
    ]);

    return sock.sendMessage(jid, { text: infoText }, { quoted: msg });
  },
};
