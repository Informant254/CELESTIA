module.exports = {
  name: 'zip',
  aliases: ['botzip', 'sourcecode', 'getzip'],
  description: 'Send the main bot repo as a ZIP file',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const REPO = 'Informant254/CELESTIA';
    const url = `https://github.com/${REPO}/archive/refs/heads/main.zip`;

    await sock.sendMessage(jid, { text: '⏳ Fetching bot source code ZIP...' }, { quoted: msg });

    try {
      await sock.sendMessage(
        jid,
        {
          document: { url },
          mimetype: 'application/zip',
          fileName: 'CELESTIA.zip',
          caption:
            `╔══════════════════════╗\n` +
            `║   📦  BOT SOURCE CODE  \n` +
            `╚══════════════════════╝\n\n` +
            `📁 *Repo:* ${REPO}\n` +
            `🌿 *Branch:* main\n` +
            `🔗 *GitHub:* https://github.com/${REPO}`,
        },
        { quoted: msg }
      );
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Failed to fetch ZIP: ${error.message}` }, { quoted: msg });
    }
  },
};
