const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'imagesearch',
  aliases: ['imgsearch', 'photosearch', 'gis', 'image'],
  description: 'Search for images using query. Usage: .imagesearch <query>',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const query = args.join(' ').trim();

    if (!query) {
      return await sock.sendMessage(
        jid,
        { text: '📌 *Image Search*\n\n*Usage:* `.imagesearch dog`\n*Aliases:* `.imgsearch`, `.photosearch`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: `🔍 Searching for "${query}"...` },
      { quoted: msg }
    );

    try {
      const { data } = await axios.get(
        `${KEITH_BASE}/search/images?query=${encodeURIComponent(query)}`,
        { timeout: 60000 }
      );

      if (!data?.status || !data?.result?.length) {
        return await sock.sendMessage(
          jid,
          { text: '❌ No images found.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      await sock.sendMessage(jid, { delete: thinkingMsg.key }).catch(() => {});

      const limitList = data.result.slice(0, 5);

      for (let i = 0; i < limitList.length; i++) {
        const img = limitList[i];
        const imageUrl = img.thumbnail || img.url;

        if (imageUrl) {
          await sock.sendMessage(
            jid,
            {
              image: { url: imageUrl },
              caption: i === 0 ? `🔎 *${query}*\n📸 ${limitList.length} results found` : undefined
            },
            { quoted: msg }
          );
        }
      }

    } catch (err) {
      console.error('[IMAGESEARCH ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ Error: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  }
};

