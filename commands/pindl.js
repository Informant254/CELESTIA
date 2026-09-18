const axios = require('axios');

module.exports = {
  name: 'pindl',
  aliases: ['pin', 'pinterest'],
  description: 'Download Pinterest image or video. Usage: .pindl <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text || !text.startsWith('http')) {
      return sock.sendMessage(jid, { text: '📌 Provide a valid Pinterest link!' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { text: '⏳ Fetching Pinterest media...' }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '📌', key: msg.key } });

      const res = await axios.get(`https://api.bk9.dev/download/pinterest?url=${encodeURIComponent(text)}`, { timeout: 60000 });
      const payload = res.data?.BK9 ?? res.data?.result ?? res.data;

      // Normalize: bk9 shape, legacy medias shape, or any bare URL in payload.
      let title = payload?.title || 'Pinterest Media';
      let medias = [];
      if (payload && Array.isArray(payload.medias)) {
        medias = payload.medias;
      } else {
        const { pickCleanUrl, collectMediaUrls } = require('../utils/downloader');
        const cands = collectMediaUrls(payload).filter((c) => !/thumb|preview|poster/i.test(c.key));
        medias = cands.map((c) => ({ url: c.url, extension: /\.mp4(\?|$)/i.test(c.url) ? 'mp4' : 'jpg' }));
      }

      if (!medias.length) {
        return sock.sendMessage(jid, { text: '❌ Failed to fetch Pinterest media.' }, { quoted: msg });
      }

      for (const media of medias.slice(0, 5)) {
        const { url, extension, videoAvailable } = media;
        if (!url) continue;

        try {
          const bufferRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000 });
          const size = bufferRes.headers['content-length'];
          if (size && parseInt(size) > 100 * 1024 * 1024) {
            await sock.sendMessage(jid, { text: '⚠️ Skipped large file.' }, { quoted: msg });
            continue;
          }

          const buffer = Buffer.from(bufferRes.data);
          if (!buffer.length) continue;
          const fileName = `${title}.${extension || 'jpg'}`.replace(/[^\w\s.-]/gi, '');

          if (videoAvailable || extension === 'mp4') {
            await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: '📌 Pinterest Video' }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { image: buffer, fileName, caption: '📌 Pinterest Image' }, { quoted: msg });
          }
        } catch (err) {}
      }
    } catch (err) {
      console.error('[PINDL ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error downloading Pinterest media.' }, { quoted: msg });
    }
  },
};
