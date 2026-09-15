const { bk9Social, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'twitter',
  aliases: ['tw', 'x', 'twdl'],
  description: 'Download a Twitter/X video. Usage: .twitter <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//.test(url)) {
      return sock.sendMessage(jid, { text: '🐦 Send a Twitter/X link!\nEg: `.twitter https://x.com/user/status/...`' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '🐦', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: '⏳ Downloading...' }, { quoted: msg });

      const { url: videoUrl } = await bk9Social('twitter', url);

      await sock.sendMessage(
        jid,
        { video: { url: videoUrl }, mimetype: 'video/mp4', fileName: cleanName('twitter', '.mp4'), caption: '🐦 *Downloaded by CELESTIA*' },
        { quoted: msg }
      );
      await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
    } catch (e) {
      console.error('[TWITTER ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Download failed: ' + e.message }, { quoted: msg });
    }
  },
};
