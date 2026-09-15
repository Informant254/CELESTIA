const axios = require('axios');

module.exports = {
  name: 'wiki',
  aliases: ['wikipedia'],
  description: 'Look up Wikipedia. Usage: .wiki <topic>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const topic = args.join(' ').trim();

    if (!topic) {
      return sock.sendMessage(jid, { text: '📚 Usage: `.wiki <topic>`' }, { quoted: msg });
    }

    try {
      const r = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic)}`,
        { timeout: 20000, headers: { 'User-Agent': 'CELESTIA-Bot/2.0' } }
      );
      const d = r.data;
      if (d.type === 'disambiguation' || !d.extract) {
        return sock.sendMessage(jid, { text: `📚 No clear article for *${topic}*. Try being more specific.` }, { quoted: msg });
      }
      let text = `📚 *${d.title}*\n\n${d.extract}`;
      if (d.content_urls?.desktop?.page) text += `\n\n🔗 ${d.content_urls.desktop.page}`;
      if (d.thumbnail?.source) {
        await sock.sendMessage(jid, { image: { url: d.thumbnail.source }, caption: text }, { quoted: msg });
      } else {
        await sock.sendMessage(jid, { text }, { quoted: msg });
      }
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Wikipedia lookup failed: ' + (e.response?.status === 404 ? 'no article found' : e.message) }, { quoted: msg });
    }
  },
};
