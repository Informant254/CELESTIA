const backend = require('../autochat/backend');

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
      const res = await backend.complete(
        'You are MuslimAI, a respectful Islamic knowledge assistant. Answer from an authentic Islamic perspective: cite the Qur\'an with surah name, surah number and verse number, plus relevant hadith where fitting. Respectful, sincere tone, WhatsApp-friendly formatting. If you are unsure of exact wording or numbering, paraphrase honestly instead of inventing references.',
        query
      );

      if (!res || !res.text) {
        throw new Error('brain offline');
      }

      const output = `📖 *MuslimAI Results for:* ${query}\n\n${res.text.trim()}`;

      await sock.sendMessage(
        jid,
        { text: output.trim(), edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[MUSLIMAI ERROR]', err.message);
      await sock.sendMessage(
        jid,
        { text: '❌ MuslimAI is offline right now. Please try again later.', edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
