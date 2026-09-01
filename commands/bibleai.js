const axios = require('axios');
const { KEITH_BASE } = require('../config/apis');

const API = KEITH_BASE;

module.exports = {
  name: 'bibleai',
  aliases: ['aibible', 'scripture'],
  description: 'Ask Bible-based questions and get answers with references',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        jid,
        { text: '📖 Ask a Bible question.\n\nExample: `.bibleai what is faith`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '📖 *Searching Scripture...*' }, { quoted: msg });

    try {
      const { data } = await axios.get(`${API}/ai/bible?q=${encodeURIComponent(query)}`, { timeout: 120000 });

      if (!data?.status || !data?.result?.results?.data?.answer) {
        throw new Error('No Bible answer found.');
      }

      const answer = data.result.results.data.answer;
      const sources = data.result.results.data.sources || [];

      let caption = `📖 *${query}*\n\n${answer}`;

      if (sources.length > 0) {
        caption += `\n\n📌 *Sources:*\n` +
          sources.map((src, i) => {
            if (src.type === 'verse') return `${i + 1}. 📜 ${src.text}`;
            if (src.type === 'article') return `${i + 1}. 📘 ${src.title}`;
            return `${i + 1}. ${src.text || src.title}`;
          }).join('\n');
      }

      await sock.sendMessage(
        jid,
        { text: caption, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[BIBLEAI ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ Error fetching Bible answer: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};

