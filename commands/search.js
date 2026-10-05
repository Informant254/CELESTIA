const { searchWeb, formatPublishedDate } = require('../utils/liveSearch');

function formatSearchResponse(query, search) {
  if (search.mode !== 'NEWS') {
    const lines = search.results
      .map((result, index) => `*${index + 1}.* ${result.title}\n${result.snippet ? `${result.snippet}\n` : ''}🔗 ${result.url}`)
      .join('\n\n');
    return `🌐 *Live results for "${query}":*\n\n${lines}`;
  }

  const lines = search.results.map((result, index) => {
    const summary = result.snippet || 'No summary provided by the source.';
    return `*${index + 1}. ${result.title}*\n*Source:* ${result.source || 'Unknown'}\n*Published:* ${formatPublishedDate(result.publishedAt)}\n*Summary:* ${summary}\n*Link:* ${result.url}`;
  }).join('\n\n');
  return `📰 *News results for "${query}":*\n\n${lines}`;
}

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
      const search = await searchWeb(query, 5);
      await sock.sendMessage(
        jid,
        { text: formatSearchResponse(query, search), edit: thinkingMsg.key },
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
  formatSearchResponse,
};
