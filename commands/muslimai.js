const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

const API = KEITH_BASE;

module.exports = {
  name: 'muslimai',
  aliases: ['muslim', 'quranai'],
  description: "Query MuslimAI API for Qur'anic references",

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        jid,
        { text: '❌ Provide a query, e.g. `.muslimai who is Allah`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '📖 *Searching Qur\'anic references...*' }, { quoted: msg });

    try {
      const { data } = await axios.get(`${API}/ai/muslim?q=${encodeURIComponent(query)}`, { timeout: 120000 });

      if (!data?.status || !data?.result) {
        throw new Error('MuslimAI API returned an invalid response.');
      }

      const results = data.result.results;
      if (!results || results.length === 0) {
        return sock.sendMessage(
          jid,
          { text: 'ℹ️ No relevant verses found.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      let output = `📖 *MuslimAI Results for:* ${data.result.query || query}\n\n`;
      results.slice(0, 3).forEach((r, i) => {
        output += `*${i + 1}. Surah ${r.surah_title}*\n${r.content.trim()}\n🔗 ${r.surah_url}\n\n`;
      });

      await sock.sendMessage(
        jid,
        { text: output.trim(), edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[MUSLIMAI ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ Failed to fetch response: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};

