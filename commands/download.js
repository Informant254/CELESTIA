const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'download',
  description: 'Downloads audio from a YouTube link. Usage: .download <url>',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
      return await sock.sendMessage(
        jid,
        { text: 'Usage: .download <YouTube URL>\nExample: .download https://youtube.com/watch?v=...' },
        { quoted: msg }
      );
    }

    await sock.sendMessage(jid, { text: '⏳ Downloading audio, this may take a moment...' }, { quoted: msg });

    try {
      const res = await axios.get(`${KEITH_BASE}/download/audio?url=${encodeURIComponent(url)}`);
      const data = res.data;

      if (!data?.status || !data?.result) {
        throw new Error(data?.error || 'API request failed');
      }

      const audioUrl = data.result;
      const title = data.title || 'audio';

      await sock.sendMessage(
        jid,
        { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false, fileName: `${title}.mp3` },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[DOWNLOAD ERROR]', error);
      await sock.sendMessage(
        jid,
        { text: '❌ Could not download that video. Try again later or check the link.' },
        { quoted: msg }
      );
    }
  },
};
