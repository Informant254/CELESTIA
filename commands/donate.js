module.exports = {
  name: 'donate',
  aliases: ['support', 'fund'],
  description: 'Support the development of CELESTIA BOT.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ui = require('../utils/ui');
    const text = [
      ui.renderSectionTitle('❤️ SUPPORT CELESTIA BOT'),
      '',
      'Thank you for using *CELESTIA BOT*!',
      '',
      "If you'd like to support the project and help keep it growing, you can donate using any of the methods below.",
      '',
      ui.renderCard('🔒 PRIVATE SUPPORT', [
        ui.renderInfo('💬', 'Payment details', 'Available privately'),
        ui.renderInfo('🛡️', 'Owner contact', 'Not published by the bot'),
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
