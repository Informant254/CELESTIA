/**
 * commands/song.js — downloads a song from YouTube (shared downloader util).
 */
const { ytSearch, ytAudio, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'song',
  description: 'Download a song from YouTube. Usage: .song <song name>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(jid, { text: '❌ Usage: .song <song name>' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `🔍 Searching for "${query}"...` }, { quoted: msg });

    try {
      let videoUrl, videoTitle;
      if (/youtu\.be|youtube\.com/i.test(query)) {
        videoUrl = query;
        try {
          videoTitle = (await ytSearch(query)).title || 'YouTube Audio';
        } catch {
          videoTitle = 'YouTube Audio';
        }
      } else {
        const found = await ytSearch(query);
        videoUrl = found.url;
        videoTitle = found.title;
      }

      await sock.sendMessage(jid, { text: `⏳ Downloading: ${videoTitle}` }, { quoted: msg });

      const { url: audioUrl, title } = await ytAudio(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;

      await sock.sendMessage(jid, {
        audio: { url: audioUrl },
        mimetype: 'audio/mpeg',
        fileName: cleanName(finalTitle, '.mp3'),
        caption: `🎵 *${finalTitle}*`
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Song download failed: ' + e.message }, { quoted: msg });
    }
  },
};
