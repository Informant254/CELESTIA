const { downloadSocial, cleanName } = require('../utils/downloader');

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

      const owner = `${jid}:${msg.key.participant || jid}`;
      await downloadSocial('fb', url, undefined, owner, async ({ buffer, type }) => {
        const media = type === 'image'
          ? { image: buffer, fileName: cleanName('facebook', '.jpg'), caption: '📘 *Downloaded by CELESTIA*' }
          : { video: buffer, mimetype: 'video/mp4', fileName: cleanName('facebook', '.mp4'), caption: '📘 *Downloaded by CELESTIA*' };
        await sock.sendMessage(jid, media, { quoted: msg });
        await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
      });
    } catch (e) {
      console.error('[FB ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Facebook download failed: ' + e.message }, { quoted: msg });
    }
  },
};
