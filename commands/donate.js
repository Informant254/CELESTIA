module.exports = {
  name: 'donate',
  aliases: ['support', 'fund'],
  description: 'Support the development of CELESTIA BOT.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    const ownerMpesa = '0' + String(config.ownerNumber).replace(/\D/g, '').slice(3);

    const ui = require('../utils/ui');
    const text = [
      ui.renderSectionTitle('❤️ SUPPORT CELESTIA BOT'),
      '',
      'Thank you for using *CELESTIA BOT*!',
      '',
      "If you'd like to support the project and help keep it growing, you can donate using any of the methods below.",
      '',
      ui.renderCard('🇰🇪 M-PESA', [
        ui.renderInfo('📱', 'Number', ownerMpesa),
        ui.renderInfo('👤', 'Name', 'CELESTIA'),
      ]),
      '',
      '• Your support helps with hosting, new commands, bug fixes, and keeping CELESTIA BOT free for everyone.',
      '',
      '• GitHub — star & fork:',
      '• https://github.com/Informant254/CELESTIA',
      '',
      '• Thank you for supporting the project! 🚀',
    ].join('\n');

    await sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );
  }
};
