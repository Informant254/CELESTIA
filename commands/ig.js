const axios = require('axios');
const { bk9Social, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'ig',
  aliases: ['instagram', 'igreel', 'igdl'],
  description: 'Download Instagram reel/post. Usage: .ig <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//.test(url)) {
      return sock.sendMessage(jid, { text: '📸 Send an Instagram link!\nEg: `.ig https://www.instagram.com/reel/...`' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: '⏳ Downloading Instagram...' }, { quoted: msg });

      const { url: mediaUrl } = await bk9Social('instagram', url);

      const head = await axios.head(mediaUrl, { timeout: 15000 }).catch(() => null);
      const ctype = head?.headers?.['content-type'] || '';
      const isVideo = /video|octet-stream/.test(ctype) || /\.(mp4|mov)(\?|$)/i.test(mediaUrl);

      if (isVideo) {
        await sock.sendMessage(
          jid,
          { video: { url: mediaUrl }, mimetype: 'video/mp4', fileName: cleanName('instagram', '.mp4'), caption: '📸 *Downloaded by CELESTIA*' },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          jid,
          { image: { url: mediaUrl }, caption: '📸 *Downloaded by CELESTIA*' },
          { quoted: msg }
        );
      }
      await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
    } catch (e) {
      console.error('[IG ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Instagram download failed: ' + e.message }, { quoted: msg });
    }
  },
};
