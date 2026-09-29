const { downloadSocial, cleanName } = require('../utils/downloader');

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

      const owner = `${jid}:${msg.key.participant || jid}`;
      await downloadSocial('twitter', url, undefined, owner, async ({ buffer, type }) => {
        const media = type === 'image'
          ? { image: buffer, fileName: cleanName('twitter', '.jpg'), caption: '🐦 *Downloaded by CELESTIA*' }
          : { video: buffer, mimetype: 'video/mp4', fileName: cleanName('twitter', '.mp4'), caption: '🐦 *Downloaded by CELESTIA*' };
        await sock.sendMessage(jid, media, { quoted: msg });
        await sock.sendMessage(jid, { text: '✅ Done!', edit: searching.key });
      });
    } catch (e) {
      console.error('[TWITTER ERROR]', e.message);
      await sock.sendMessage(jid, { text: '❌ Download failed: ' + e.message }, { quoted: msg });
    }
  },
};
