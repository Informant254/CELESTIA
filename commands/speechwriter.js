const backend = require('../autochat/backend');

module.exports = {
  name: 'speechwriter',
  aliases: ['speech', 'writer'],
  description: 'Generate a custom speech on any topic',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;

    const query = args.join(' ').trim();

    if (!query) {
      return sock.sendMessage(
        jid,
        { text: '❌ Provide a topic, e.g. `.speechwriter how to pass exams`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '✍️ *Drafting your speech...*' }, { quoted: msg });

    try {
      const res = await backend.complete(
        'You are a skilled speechwriter. Write a powerful, well-crafted, serious speech or dedication on the topic the user gives. Keep it well-formatted with clear paragraphs, suitable for delivery. WhatsApp-friendly formatting.',
        `Write a powerful, well-crafted, serious speech on the following topic: "${query}". Keep it well-formatted with clear paragraphs.`
      );

      if (!res || !res.text) {
        throw new Error('brain offline');
      }

      const speech = res.text.trim();

      await sock.sendMessage(
        jid,
        { text: `🎙️ *Generated Speech*\n\n${speech}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[SPEECHWRITER] backend failed:', err.message);
      await sock.sendMessage(
        jid,
        { text: '❌ *Speechwriter is offline right now. Please try again later.*', edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
