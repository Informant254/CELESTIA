const axios = require('axios');

module.exports = {
  name: 'ytsearch',
  aliases: ['yts', 'youtubesearch'],
  description: 'Search YouTube and list results. Usage: .ytsearch <query>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(jid, { text: '🔍 Usage: `.ytsearch <query>`' }, { quoted: msg });
    }

    try {
      const r = await axios.get(
        `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
        { timeout: 25000 }
      );
      const list = (r.data?.data || []).slice(0, 8);
      if (!list.length) {
        return sock.sendMessage(jid, { text: '❌ No results found.' }, { quoted: msg });
      }
      const lines = list.map((v, i) => `*${i + 1}.* ${v.title || 'Untitled'}\n🔗 ${v.url || ''}`).join('\n\n');
      await sock.sendMessage(jid, { text: `🔍 *Results for "${query}":*\n\n${lines}` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Search failed: ' + (e.response?.status || e.message) }, { quoted: msg });
    }
  },
};
