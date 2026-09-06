module.exports = {
  name: 'bot',
  aliases: ['b'],
  description: 'Checks whether CELESTIA is active.',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const senderName =
      msg.pushName ||
      msg.verifiedBizName ||
      'User';

    const wolfTech = require('../utils/wolfTech');
    const caption = `
╭━━━━━━━━━━━━━━━╮
│   ✅ *ʙᴏᴛ ɪꜱ ᴀᴄᴛɪᴠᴇ*
╰━━━━━━━━━━━━━━━╯

ʜᴇʟʟᴏ, *${senderName}*! 😁🙌

ɪ ᴀᴍ ✨ *CELESTIA* — ꜰᴀꜱᴛ, ᴘᴏᴡᴇʀꜰᴜʟ
& ʜᴇᴀᴠᴇɴʟʏ ᴡɪᴛʜ ᴀᴍᴀᴢɪɴɢ
ꜰᴇᴀᴛᴜʀᴇꜱ 🔥

╭─❏ *ᴄᴏᴍᴍᴀɴᴅꜱ* ❏
│
│ ◈ ᴛʏᴘᴇ *.ᴍᴇɴᴜ* ➜ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅꜱ
│ ◈ ᴛʏᴘᴇ *.ᴘɪɴɢ* ➜ ᴄʜᴇᴄᴋ ꜱᴘᴇᴇᴅ
│ ◈ ᴛʏᴘᴇ *.ᴡᴏʟꜰᴛᴇᴄʜ* ➜ ᴏʀɪɢɪɴ ʜᴏᴡʟ 🐺
│
╰─────────────────

> 🐺 *WolfTech Inspired* → ✨ *Celestia Reborn*
> _${wolfTech.tribute.tagline}_

> *ᴛʏᴘᴇ .ᴍᴇɴᴜ ᴛᴏ ꜱᴛᴀʀᴛ* 🎉
`.trim();

    try {
      await sock.sendMessage(
        jid,
        { text: caption },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[BOT ERROR]', error);

      await sock.sendMessage(
        jid,
        {
          text: '❌ Failed to check bot status.'
        },
        { quoted: msg }
      );
    }
  }
};
