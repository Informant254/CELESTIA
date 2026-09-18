const backend = require('../autochat/backend');

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
      const res = await backend.complete(
        'You are BibleAI, a knowledgeable Bible study assistant. Answer from a Christian biblical perspective: quote relevant Scripture with book, chapter and verse references, add brief context and practical meaning. Warm pastoral tone, WhatsApp-friendly formatting. If you are unsure of exact verse wording, paraphrase honestly instead of inventing quotes.',
        query
      );

      if (!res || !res.text) {
        throw new Error('brain offline');
      }

      const answer = res.text.trim();
      const caption = `📖 *${query}*\n\n${answer}`;

      await sock.sendMessage(
        jid,
        { text: caption, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[BIBLEAI ERROR]', err.message);
      await sock.sendMessage(
        jid,
        { text: '❌ Bible AI is offline right now. Please try again later.', edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
