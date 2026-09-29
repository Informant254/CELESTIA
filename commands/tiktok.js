const { downloadSocial, cleanName } = require('../utils/downloader');

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

      const owner = `${jid}:${msg.key.participant || jid}`;
      await downloadSocial('tiktok', url, undefined, owner, async ({ buffer, type }) => {
        const media = type === 'image'
          ? { image: buffer, fileName: cleanName('tiktok', '.jpg'), caption: '🎵 *Downloaded by CELESTIA*' }
          : { video: buffer, mimetype: 'video/mp4', fileName: cleanName('tiktok', '.mp4'), caption: '🎵 *Downloaded by CELESTIA*' };
        await sock.sendMessage(jid, media, { quoted: msg });
        await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
      });
    } catch (e) {
      console.error('[TIKTOK ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ TikTok download failed: ' + e.message }, { quoted: msg });
    }
  },
};
