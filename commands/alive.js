const fs = require("fs");
const path = require("path");

module.exports = {
  name: "alive",
  description: "Shows that the bot is online.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const wolfTech = require('../utils/wolfTech');
    const caption = `
╔══════════════════════╗
      ✨ *CELESTIA* ✨
╚══════════════════════╝

😈 *I'M ALIVE MATE!* 🐺💫

☠️ *WE ARE LEGION*
☠️ *WE DO NOT FORGIVE*
☠️ *WE DO NOT FORGET*
🔥 *EXPECT US ALWAYS* 🔥

━━━━━━━━━━━━━━━━━━━━━━━
🐺 *WolfTech howled → ✨ CELESTIA answered*
🌙 *${wolfTech.tribute.fullTagline}*
━━━━━━━━━━━━━━━━━━━━━━━
💀 *Ready for your next command...*
> _${wolfTech.getRandomFooter()}_
━━━━━━━━━━━━━━━━━━━━━━━
`.trim();

    // Send the alive message
    await sock.sendMessage(
      jid,
      {
        text: caption,
      },
      {
        quoted: msg,
      }
    );

    // Send the alive audio
    const audioPath = path.join(__dirname, "../assets/alive.m4a");

    if (fs.existsSync(audioPath)) {
      await sock.sendMessage(
        jid,
        {
          audio: fs.readFileSync(audioPath),
          mimetype: "audio/mp4",
          ptt: false,
        },
        {
          quoted: msg,
        }
      );
    }
  },
};
