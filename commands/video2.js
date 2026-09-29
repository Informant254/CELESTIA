const { ytSearch, downloadYoutubeVideo, cleanName } = require('../utils/downloader');

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

      const owner = `${jid}:${msg.key.participant || jid}`;
      await downloadYoutubeVideo(videoUrl, videoTitle, undefined, owner, async ({ buffer, title }) => {
        const finalTitle = title || videoTitle;
        const fileName = cleanName(finalTitle, '.mp4');
        await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 ${finalTitle}` }, { quoted: msg });
        await sock.sendMessage(jid, { text: `✅ Successfully downloaded! *${finalTitle}*`, edit: searching.key });
      });
    } catch (err) {
      console.error('[VIDEO2 ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error downloading video: ' + err.message }, { quoted: msg });
    }
  },
};
