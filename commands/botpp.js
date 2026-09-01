const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'botpp',
  aliases: ['setmenu', 'setmenupp'],
  description: "Update menu banner using an image reply, text reply, or user mention.",

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    if (!isOwner(msg)) {
      return await sock.sendMessage(
        jid,
        { text: '❌ *Only the bot owner can change the menu picture.*' },
        { quoted: msg }
      );
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const mentionedJid = ctx?.mentionedJid?.[0] || (args[0] && args[0].includes('@') ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null);

    const targetJid = mentionedJid || ctx?.participant;

    if (!quoted && !targetJid) {
      return await sock.sendMessage(
        jid,
        { text: '❌ *Usage:* Reply to an image, reply to a user\'s message, or tag someone with `.botpp @user`' },
        { quoted: msg }
      );
    }

    let imageBuffer = null;

    try {
      if (quoted?.imageMessage) {
        imageBuffer = await downloadMediaMessage(
          { message: quoted },
          'buffer',
          {}
        );
      } else if (targetJid) {
        let profilePicUrl;
        try {
          profilePicUrl = await sock.profilePictureUrl(targetJid, 'image');
        } catch {
          return await sock.sendMessage(
            jid,
            { text: '❌ *Could not fetch profile picture. The user might have hidden it.*' },
            { quoted: msg }
          );
        }

        const res = await axios.get(profilePicUrl, { responseType: 'arraybuffer' });
        imageBuffer = Buffer.from(res.data);
      }

      if (!imageBuffer) {
        return await sock.sendMessage(
          jid,
          { text: '❌ *Could not process image.*' },
          { quoted: msg }
        );
      }

      // 1. Persist in settingsStore (Survives Heroku dyno restarts)
      const base64Image = imageBuffer.toString('base64');
      settingsStore.set('menu_banner', base64Image);

      // 2. Write to local disk assets/script.jpg
      const assetsDir = path.join(__dirname, '../assets');
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(assetsDir, 'script.jpg'), imageBuffer);

      await sock.sendMessage(
        jid,
        { text: '✅ *Menu image updated successfully! Type menu to verify.*' },
        { quoted: msg }
      );

    } catch (e) {
      console.error('[BOTPP ERROR]', e);
      await sock.sendMessage(
        jid,
        { text: `❌ *Failed to update menu image:* ${e.message}` },
        { quoted: msg }
      );
    }
  },
};

