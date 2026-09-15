const { ytSearch, ytAudio, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'play2',
  aliases: ['yta2'],
  description: 'Download YouTube audio via alternate route. Usage: .play2 <song name or link>',
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
        const found = await ytSearch(text);
        videoUrl = found.url;
        videoTitle = found.title;
      }

      await sock.sendMessage(jid, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: searching.key });

      const { url: downloadUrl, title } = await ytAudio(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;
      const fileName = cleanName(finalTitle, '.mp3');

      await sock.sendMessage(jid, { audio: { url: downloadUrl }, mimetype: 'audio/mpeg', fileName }, { quoted: msg });
      await sock.sendMessage(jid, { document: { url: downloadUrl }, mimetype: 'audio/mpeg', caption: '*DOWNLOADED BY CELESTIA*', fileName }, { quoted: msg });
      await sock.sendMessage(jid, { text: `✅ Successfully downloaded! *${finalTitle}*`, edit: searching.key });
    } catch (err) {
      console.error('[PLAY2 ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ An error occurred: ' + err.message }, { quoted: msg });
    }
  },
};
