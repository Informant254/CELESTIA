const { downloadSocial, cleanName } = require('../utils/downloader');

module.exports = {
  name: 'ig',
  aliases: ['instagram', 'insta', 'igreel', 'igdl'],
  description: 'Download Instagram reel/post. Usage: .ig <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const url = args[0];

    if (!url || !/^https?:\/\//.test(url)) {
      return sock.sendMessage(jid, { text: '📸 Send an Instagram link!\nEg: `.ig https://www.instagram.com/reel/...`' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
      const searching = await sock.sendMessage(jid, { text: '⏳ Downloading Instagram...' }, { quoted: msg });

      const owner = `${jid}:${msg.key.participant || jid}`;
      await downloadSocial('instagram', url, undefined, owner, async ({ buffer, type }) => {
        if (type === 'video') {
          await sock.sendMessage(
            jid,
            { video: buffer, mimetype: 'video/mp4', fileName: cleanName('instagram', '.mp4'), caption: '📸 *Downloaded by CELESTIA*' },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(
            jid,
            { image: buffer, caption: '📸 *Downloaded by CELESTIA*' },
            { quoted: msg }
          );
        }
        await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
      });
    } catch (e) {
      console.error('[IG ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Instagram download failed: ' + e.message }, { quoted: msg });
    }
  },
};
