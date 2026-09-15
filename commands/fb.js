const { bk9Social, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'fb',
  aliases: ['facebook', 'fbdl'],
  description: 'Download a Facebook video. Usage: .fb <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//.test(url)) {
      return sock.sendMessage(jid, { text: '📘 Send a Facebook video link!\nEg: `.fb https://www.facebook.com/watch/?v=...`' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '📘', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: '⏳ Downloading Facebook video...' }, { quoted: msg });

      const { url: videoUrl } = await bk9Social('fb', url);

      await sock.sendMessage(
        jid,
        { video: { url: videoUrl }, mimetype: 'video/mp4', fileName: cleanName('facebook', '.mp4'), caption: '📘 *Downloaded by CELESTIA*' },
        { quoted: msg }
      );
      await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
    } catch (e) {
      console.error('[FB ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Facebook download failed: ' + e.message }, { quoted: msg });
    }
  },
};
