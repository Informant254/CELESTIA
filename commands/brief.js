const { searchWeb } = require('../utils/liveSearch');
const {
  toNewsSearchQuery,
  selectDiverseSources,
  generateNewsBrief,
  formatBriefResponse,
} = require('../utils/newsBrief');

module.exports = {
  name: 'brief',
  aliases: ['newsbrief', 'headlines'],
  description: 'Fresh multi-source AI news brief with citations. Usage: .brief <topic>',
  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;
    const topic = args.join(' ').trim();
    if (!topic) {
      return sock.sendMessage(
        jid,
        { text: '📰 *CELESTIA News Brief*\n\n*Usage:* `.brief Kenya technology`\n*Aliases:* `.newsbrief`, `.headlines`' },
        { quoted: msg }
      );
    }

    const thinking = await sock.sendMessage(
      jid,
      { text: `📰 Building a fresh multi-source brief for "${topic}"...` },
      { quoted: msg }
    );

    try {
      const query = toNewsSearchQuery(topic);
      const search = await searchWeb(query, 8);
      const sources = selectDiverseSources(search.results, 5);
      const brief = await generateNewsBrief(topic, sources);
      console.log(`[CELESTIA BRIEF] topic=${topic.slice(0, 80)} sources=${sources.length} engine=${brief.engine}`);
      return await sock.sendMessage(
        jid,
        { text: formatBriefResponse(topic, sources, brief), edit: thinking.key },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[CELESTIA BRIEF]', String(error.message || error).slice(0, 160));
      const text = /No verifiably recent news results/i.test(error.message)
        ? `❌ ${error.message}`
        : '❌ Could not build a current news brief right now. Please try again shortly.';
      try {
        return await sock.sendMessage(jid, { text, edit: thinking.key }, { quoted: msg });
      } catch {
        return sock.sendMessage(jid, { text }, { quoted: msg });
      }
    }
  },
};
