const axios = require('axios');
const { ytSearch, ytVideo, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'video2',
  aliases: ['ytv2'],
  description: 'Download YouTube video via alternate route. Usage: .video2 <video name or link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(jid, { text: '🎬 Provide a video name or YouTube link!' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '🎬', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: `🔍 Searching *${text}*...` }, { quoted: msg });

      let videoUrl, videoTitle;
      if (/(youtube\.com|youtu\.be)/i.test(text)) {
        videoUrl = text;
        videoTitle = 'YouTube Video';
      } else {
        const found = await ytSearch(text);
        videoUrl = found.url;
        videoTitle = found.title;
      }

      await sock.sendMessage(jid, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: searching.key });

      const { url: downloadUrl, title } = await ytVideo(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;

      const head = await axios.head(downloadUrl, { timeout: 15000 }).catch(() => null);
      if (head && head.headers['content-type'] && !/video|octet-stream/.test(head.headers['content-type'])) {
        return sock.sendMessage(jid, { text: '❌ Invalid video format from API.', edit: searching.key });
      }

      const response = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
      const size = response.headers['content-length'];
      if (size && parseInt(size) > 150 * 1024 * 1024) {
        return sock.sendMessage(jid, { text: '❌ Video too large. Try another one.', edit: searching.key });
      }

      const buffer = Buffer.from(response.data);
      if (!buffer.length) {
        return sock.sendMessage(jid, { text: '❌ Downloaded file was empty. Try again.', edit: searching.key });
      }

      const fileName = cleanName(finalTitle, '.mp4');

      await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 ${finalTitle}` }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Successfully downloaded! *${finalTitle}*`, edit: searching.key });
    } catch (err) {
      console.error('[VIDEO2 ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error downloading video: ' + err.message }, { quoted: msg });
    }
  },
};
