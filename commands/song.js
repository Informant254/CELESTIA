/**
 * commands/song.js
 * ------------------
 * Downloads a song from YouTube using the Keith API. Centralized via
 * config/apis.js — update KEITH_BASE there if this API ever changes.
 */
const axios = require('axios');
const yts = require('yt-search');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'song',
  description: 'Download a song from YouTube. Usage: .song <song name>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      return sock.sendMessage(jid, { text: '❌ Usage: .song <song name>' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `🔍 Searching for "${query}"...` }, { quoted: msg });

    try {
      const search = await yts(query);
      const video = search.videos?.[0];
      if (!video) {
        return sock.sendMessage(jid, { text: '❌ No results found.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: `⏳ Downloading: ${video.title} (${video.timestamp})` }, { quoted: msg });

      const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
      const download = await axios.get(`${KEITH_BASE}/download/ytmp3?url=${encodeURIComponent(videoUrl)}`);
      const audioUrl = download.data?.result;

      if (!audioUrl) {
        throw new Error('Failed to retrieve audio.');
      }

      await sock.sendMessage(jid, {
        audio: { url: audioUrl },
        mimetype: 'audio/mpeg',
        fileName: `${video.title}.mp3`.replace(/[\\/:*?"<>|]/g, ''),
        caption: `🎵 *${video.title}*\n⏱ ${video.timestamp} | 👁 ${video.views}`
      }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Song download failed: ' + e.message }, { quoted: msg });
    }
  }
};
