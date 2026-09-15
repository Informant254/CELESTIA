const { ytAudio, cleanName } = require('../utils/downloader');

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
      const { url: audioUrl, title } = await ytAudio(url);

      await sock.sendMessage(
        jid,
        { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false, fileName: cleanName(title, '.mp3') },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[DOWNLOAD ERROR]', error.message);
      await sock.sendMessage(
        jid,
        { text: '❌ Could not download that video. ' + error.message },
        { quoted: msg }
      );
    }
  },
};
