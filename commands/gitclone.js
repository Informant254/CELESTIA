const axios = require('axios');

module.exports = {
  name: 'gitclone',
  aliases: ['clone'],
  description: 'Download a GitHub repo as ZIP',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return await sock.sendMessage(jid, { text: 'Where is the link?' }, { quoted: msg });
    }

    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      return await sock.sendMessage(jid, { text: '❌ Could not parse that GitHub link.' }, { quoted: msg });
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
      return await sock.sendMessage(jid, { text: 'Is that a GitHub repo link?' }, { quoted: msg });
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const user = parts[0];
    const repo = parts[1]?.replace(/\.git$/i, '');
    if (!user || !repo) {
      return await sock.sendMessage(jid, { text: '❌ Could not parse that GitHub link.' }, { quoted: msg });
    }

    const url = `https://api.github.com/repos/${user}/${repo}/zipball`;

    try {
      const headRes = await axios.head(url, {
        headers: { 'User-Agent': 'CELESTIA' },
        maxRedirects: 5,
      });

      const disposition = headRes.headers['content-disposition'];
      const filenameMatch = disposition?.match(/attachment; filename=(.*)/);
      const filename = filenameMatch ? filenameMatch[1] : `${user}-${repo}`;

      await sock.sendMessage(
        jid,
        {
          document: { url },
          fileName: `${filename}.zip`,
          mimetype: 'application/zip',
        },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[GITCLONE ERROR]', error);
      await sock.sendMessage(
        jid,
        { text: '❌ Could not fetch that repo. Check the link and try again.' },
        { quoted: msg }
      );
    }
  },
};
