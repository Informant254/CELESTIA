const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');
const API = KEITH_BASE;

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

      const res = await axios.get(`${API}/download/pindl2?url=${encodeURIComponent(text)}`, { timeout: 100000 });
      const result = res.data?.result;

      if (!result?.success || !Array.isArray(result.medias)) {
        return sock.sendMessage(jid, { text: '❌ Failed to fetch Pinterest media.' }, { quoted: msg });
      }

      const title = result.title || 'Pinterest Media';

      for (const media of result.medias) {
        const { url, extension, videoAvailable } = media;
        if (!url) continue;

        try {
          const bufferRes = await axios.get(url, { responseType: 'arraybuffer' });
          const size = bufferRes.headers['content-length'];
          if (size && parseInt(size) > 100 * 1024 * 1024) {
            await sock.sendMessage(jid, { text: '⚠️ Skipped large file.' }, { quoted: msg });
            continue;
          }

          const buffer = Buffer.from(bufferRes.data);
          const fileName = `${title}.${extension || 'jpg'}`.replace(/[^\w\s.-]/gi, '');

          if (videoAvailable || extension === 'mp4') {
            await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: '📌 Pinterest Video' }, { quoted: msg });
          } else {
            await sock.sendMessage(jid, { image: buffer, fileName, caption: '📌 Pinterest Image' }, { quoted: msg });
          }
        } catch (err) {}
      }
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error downloading Pinterest media.' }, { quoted: msg });
    }
  },
};
