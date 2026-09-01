const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');
const API = KEITH_BASE;

module.exports = {
  name: 'play2',
  aliases: ['yta2'],
  description: 'Download YouTube audio via alternate API. Usage: .play2 <song name or link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(jid, { text: '🎧 Provide a song name or YouTube link!\nEg: .play2 Blinding Lights' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: `🔍 Searching *${text}*...` }, { quoted: msg });

      let videoUrl, videoTitle;
      if (/(youtube\.com|youtu\.be)/i.test(text)) {
        videoUrl = text;
        videoTitle = 'YouTube Audio';
      } else {
        const search = await axios.get(`${API}/search/yts?query=${encodeURIComponent(text)}`);
        const videos = search.data?.result;
        if (!Array.isArray(videos) || videos.length === 0) {
          return sock.sendMessage(jid, { text: `❌ No results found for: *${text}*`, edit: searching.key });
        }
        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
      }

      await sock.sendMessage(jid, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: searching.key });

      const apiRes = await axios.get(
        `https://mcow.giftedtechnexus.workers.dev/api/yta?url=${encodeURIComponent(videoUrl)}`,
        { timeout: 60000 }
      );
      const data = apiRes.data;

      if (!data.success || !data.result?.download_url) {
        return sock.sendMessage(jid, { text: '❌ Download failed. Try a different song.', edit: searching.key });
      }

      const finalTitle = data.result.title || videoTitle;
      const downloadUrl = data.result.download_url;
      const fileName = finalTitle.replace(/[\/\\:*?"<>|]/g, '').trim() + '.mp3';

      await sock.sendMessage(jid, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: msg });
      await sock.sendMessage(jid, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', caption: '*DOWNLOADED BY CELESTIA*', fileName }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Successfully downloaded! *${finalTitle}*`, edit: searching.key });
    } catch (err) {
      await sock.sendMessage(jid, { text: '❌ An error occurred. Try again.' }, { quoted: msg });
    }
  },
};
