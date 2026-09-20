const kit = require('../utils/stickerKit');

module.exports = {
  name: 'aisticker', aliases: ['stickerai'], description: 'Generate a WhatsApp sticker from a description',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const prompt = args.join(' ').trim();
    if (!prompt) return sock.sendMessage(jid, { text: '🎨 Use `.aisticker <description>`\nExample: `.aisticker sleepy purple wolf holding coffee`' }, { quoted: msg });
    if (prompt.length > 700) return sock.sendMessage(jid, { text: '❌ Keep the sticker description under 700 characters.' }, { quoted: msg });
    try {
      await sock.sendMessage(jid, { text: '🎨 Drawing your AI sticker...' }, { quoted: msg });
      const sticker = await kit.toSticker(await kit.aiArt(prompt), { pack: 'CELESTIA AI', author: msg.pushName || 'CELESTIA', categories: ['🎨', '✨'], removeWhite: true });
      await sock.sendMessage(jid, { sticker }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ AI sticker failed: ${String(error.message).slice(0, 150)}` }, { quoted: msg });
    }
  },
};
