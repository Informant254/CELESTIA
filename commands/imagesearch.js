const axios = require('axios');

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
      // Wikimedia Commons: free, keyless, reliable image search.
      // (requires a descriptive User-Agent or it 403s)
      const { data } = await axios.get('https://commons.wikimedia.org/w/api.php', {
        params: {
          action: 'query', format: 'json', generator: 'search',
          gsrsearch: query, gsrnamespace: 6, gsrlimit: 10,
          prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: 800,
        },
        timeout: 30000,
        headers: { 'User-Agent': 'CELESTIA-Bot/2.0 (WhatsApp image search)' },
      });

      const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
      const results = pages
        .map((p) => p.imageinfo?.[0]?.thumburl || p.imageinfo?.[0]?.url)
        .filter(Boolean)
        .slice(0, 5);

      if (!results.length) {
        return await sock.sendMessage(
          jid,
          { text: '❌ No images found.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      await sock.sendMessage(jid, { delete: thinkingMsg.key }).catch(() => {});

      for (let i = 0; i < results.length; i++) {
        await sock.sendMessage(
          jid,
          {
            image: { url: results[i] },
            caption: i === 0 ? `🔎 *${query}*\n📸 ${results.length} results found` : undefined
          },
          { quoted: msg }
        );
      }

    } catch (err) {
      console.error('[IMAGESEARCH ERROR]', err.message);
      await sock.sendMessage(
        jid,
        { text: `❌ Error: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
