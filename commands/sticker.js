const { downloadMediaMessage } = require('@whiskeysockets/baileys');
module.exports = {
  name: 'sticker',
  aliases: ['s', 'stick'],
  description: 'Image to sticker (CELESTIA + CELESTIA)',
  execute: async (sock, msg, args, commands, reply) => {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasImage = msg.message?.imageMessage || quoted?.imageMessage || quoted?.stickerMessage;
    
    if (!hasImage) return reply('❌ Reply to an image with .sticker');

    try {
      await reply('🎨 Creating sticker...');
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      // wa-sticker-formatter would be used here if needed, fallback to send as sticker
      await sock.sendMessage(msg.key.remoteJid, { sticker: buffer }, { quoted: msg });
    } catch (e) {
      await reply(`❌ Sticker failed: ${e.message}`);
    }
  }
};
