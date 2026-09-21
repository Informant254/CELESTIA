const { searchWeb } = require('../utils/liveSearch');

module.exports = {
  name: 'search',
  aliases: ['web', 'google', 'livesearch'],
  description: 'Live web search via metasearch. Usage: .search <query>',
  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const query = args.join(' ').trim();
    if (!query) {
      return sock.sendMessage(
        jid,
        { text: '🔍 *Live Search*\n\n*Usage:* `.search latest tech news`\n*Aliases:* `.web`, `.google`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: `🔍 Searching the live web for "${query}"...` },
      { quoted: msg }
    );

    try {
      const { results } = await searchWeb(query, 5);
      const lines = results
        .map((r, i) => `*${i + 1}.* ${r.title}\n${r.snippet ? `${r.snippet}\n` : ''}🔗 ${r.url}`)
        .join('\n\n');
      await sock.sendMessage(
        jid,
        { text: `🌐 *Live results for "${query}":*\n\n${lines}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (e) {
      await sock.sendMessage(
        jid,
        { text: `❌ ${e.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
