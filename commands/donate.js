module.exports = {
  name: 'donate',
  aliases: ['support', 'fund'],
  description: 'Support the development of CELESTIA BOT.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const text = `
╭━━〔 ❤️ SUPPORT CELESTIA BOT 〕━━⬣

Thank you for using *CELESTIA BOT*!

If you'd like to support the project and help keep it growing, you can donate using any of the methods below.

🌍 Online Donations
https://ko-fi.com/kingplayboi

🇰🇪 M-Pesa
📱 Number: 0718701810
👤 Name: CELESTIA

💡 Your support helps with:
• Hosting and server costs
• New commands and features
• Bug fixes and maintenance
• Keeping CELESTIA BOT free for everyone

🔗 GitHub
https://github.com/celestia/celestia

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
