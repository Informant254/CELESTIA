const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = {
  name: 'script',
  aliases: ['repo', 'github'],
  description: 'Shows the CELESTIA repository information.',

  async execute(sock, msg) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const senderName = msg.pushName || msg.verifiedBizName || 'User';
    const imagePath = path.join(__dirname, '../assets/script.jpg');

    const repoOwner = 'kingplayboi';
    const repoName = 'CELESTIA';

    try {
      // Fetch repository data from GitHub API
      const { data } = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}`);

      const createdDate = new Date(data.created_at).toLocaleDateString("en-KE", {
        day: "numeric", month: "short", year: "numeric"
      });

      const lastUpdateDate = new Date(data.updated_at).toLocaleDateString("en-KE", {
        day: "numeric", month: "short", year: "numeric"
      });

      const caption = `
Hello 👋 *${senderName},*

╔═══〔 🔥 CELESTIA TECH 🔥 〕═══╗
║    The Ultimate WhatsApp Bot
╚═══════════════════════════╝

╭───────────────────
│⭐ *Stars:* ${data.stargazers_count}
│🍴 *Forks:* ${data.forks_count}
│📅 *Created:* ${createdDate}
│🔄 *Last Update:* ${lastUpdateDate}
│👨‍💻 *Developer:* ${repoOwner}
╰───────────────────

🔷 *GitHub Repo:*
↳ ${data.html_url}
⭐ Please star and fork the repository!

🔗 *WhatsApp Pairing:*
↳ https://session2-bvny.onrender.com/
↳ https://kingpin-3e2m.onrender.com
★ Save your Session-ID!

⚙️ *Requirements:*
✓ Complete all variables
✓ Keep API keys secure
✓ Deploy properly

━━━━━━━━━━━━━━━━━━━━━━
🔥 Made on Earth by Humans!
❤️ Powered by *CELESTIA TECH*
━━━━━━━━━━━━━━━━━━━━━━`.trim();

      if (fs.existsSync(imagePath)) {
        await sock.sendMessage(
          jid,
          { image: fs.readFileSync(imagePath), caption },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          jid,
          { text: caption },
          { quoted: msg }
        );
      }
    } catch (error) {
      console.error('[SCRIPT ERROR]', error);
      await sock.sendMessage(
        jid,
        { text: '❌ Failed to load script information.' },
        { quoted: msg }
      );
    }
  }
};
