const { bk9Social, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'tiktok',
  aliases: ['tt', 'ttdl'],
  description: 'Download a TikTok video (no watermark). Usage: .tiktok <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//.test(url)) {
      return sock.sendMessage(jid, { text: '🎵 Send a TikTok link!\nEg: `.tiktok https://www.tiktok.com/@user/video/...`' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '🎵', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: '⏳ Downloading TikTok...' }, { quoted: msg });

      const { url: videoUrl } = await bk9Social('tiktok', url);

      await sock.sendMessage(
        jid,
        { video: { url: videoUrl }, mimetype: 'video/mp4', fileName: cleanName('tiktok', '.mp4'), caption: '🎵 *Downloaded by CELESTIA*' },
        { quoted: msg }
      );
      await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
    } catch (e) {
      console.error('[TIKTOK ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ TikTok download failed: ' + e.message }, { quoted: msg });
    }
  },
};
