const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');
const API = KEITH_BASE;

module.exports = {
  name: 'video2',
  aliases: ['ytv2'],
  description: 'Download YouTube video via alternate API. Usage: .video2 <video name or link>',
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
        const search = await axios.get(`${API}/search/yts?query=${encodeURIComponent(text)}`);
        const videos = search.data?.result;
        if (!Array.isArray(videos) || videos.length === 0) {
          return sock.sendMessage(jid, { text: '❌ No results found.', edit: searching.key });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
      }

      await sock.sendMessage(jid, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: searching.key });

      const download = await axios.get(`${API}/download/mp4?url=${encodeURIComponent(videoUrl)}`);
      const downloadUrl = download.data?.result;
      if (!downloadUrl) {
        return sock.sendMessage(jid, { text: '❌ Failed to get video.', edit: searching.key });
      }

      const head = await axios.head(downloadUrl).catch(() => null);
      if (!head || !head.headers['content-type']?.includes('video')) {
        return sock.sendMessage(jid, { text: '❌ Invalid video format from API.', edit: searching.key });
      }

      const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
      const size = response.headers['content-length'];
      if (size && parseInt(size) > 150 * 1024 * 1024) {
        return sock.sendMessage(jid, { text: '❌ Video too large. Try another one.', edit: searching.key });
      }

      const buffer = Buffer.from(response.data);
      const fileName = `${videoTitle}.mp4`.replace(/[^\w\s.-]/gi, '');

      await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 ${videoTitle}` }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Successfully downloaded! *${videoTitle}*`, edit: searching.key });
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ Error downloading video. API may be unstable.' }, { quoted: msg });
    }
  },
};
