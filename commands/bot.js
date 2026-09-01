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

    const caption = `
╭━━━━━━━━━━━━━━━╮
│   ✅ *ʙᴏᴛ ɪꜱ ᴀᴄᴛɪᴠᴇ*
╰━━━━━━━━━━━━━━━╯

ʜᴇʟʟᴏ, *${senderName}*! 😁🙌

ɪ ᴀᴍ ᴀ ꜰᴀꜱᴛ & ᴘᴏᴡᴇʀꜰᴜʟ
ᴡʜᴀᴛꜱᴀᴘᴘ ʙᴏᴛ ᴡɪᴛʜ ᴀᴍᴀᴢɪɴɢ
ꜰᴇᴀᴛᴜʀᴇꜱ 🔥

╭─❏ *ᴄᴏᴍᴍᴀɴᴅꜱ* ❏
│
│ ◈ ᴛʏᴘᴇ *.ᴍᴇɴᴜ* ➜ ᴀʟʟ ᴄᴏᴍᴍᴀɴᴅꜱ
│ ◈ ᴛʏᴘᴇ *.ᴘɪɴɢ* ➜ ᴄʜᴇᴄᴋ ꜱᴘᴇᴇᴅ
│ ◈ ᴛʏᴘᴇ *.ᴜᴘᴅᴀᴛᴇ* ➜ ʟᴀᴛᴇꜱᴛ ᴠᴇʀꜱɪᴏɴ
│
╰─────────────────

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
