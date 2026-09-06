module.exports = {
  name: 'donate',
  aliases: ['support', 'fund'],
  description: 'Support the development of CELESTIA BOT.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    const ownerMpesa = '0' + String(config.ownerNumber).replace(/\D/g, '').slice(3);

    const text = `
╭━━〔 ❤️ SUPPORT CELESTIA BOT 〕━━⬣

Thank you for using *CELESTIA BOT*!

If you'd like to support the project and help keep it growing, you can donate using any of the methods below.

🇰🇪 M-Pesa
📱 Number: ${ownerMpesa}
👤 Name: CELESTIA

💡 Your support helps with:
• Hosting and server costs
• New commands and features
• Bug fixes and maintenance
• Keeping CELESTIA BOT free for everyone

🔗 GitHub — star & fork:
https://github.com/Informant254/CELESTIA

Thank you for supporting the project! 🚀

╰━━━━━━━━━━━━━━⬣
`.trim();

    await sock.sendMessage(
      jid,
      { text },
      { quoted: msg }
    );
  }
};
