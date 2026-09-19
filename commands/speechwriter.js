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

    const { policyBlock } = require('../autochat/refusalPolicy');
    const SYSTEM = `You are a skilled speechwriter. Write a powerful, well-crafted, serious speech or dedication on any lawful topic the user gives. Keep it well-formatted with clear paragraphs, suitable for delivery. WhatsApp-friendly formatting. If a topic could sound manipulative or demeaning, render it as a respectful, sincere, good-faith appeal instead of refusing — never shame, stereotype, coerce, or target anyone.\n\n${policyBlock()}`;
    // A provider refusal ("I'm sorry...") is text, not an error — without
    // this check the refusal itself gets delivered as the speech.
    const isRefusal = (text) => /^(i['’]m sorry|i can['’]t|i cannot|i['’]m unable|i am unable|as an ai|i don['’]t feel comfortable|i must decline)\b/i.test(String(text || '').trim());

    try {
      let res = await backend.complete(
        SYSTEM,
        `Write a powerful, well-crafted, serious speech on the following topic: "${query}". Keep it well-formatted with clear paragraphs.`
      );

      if (res && res.text && isRefusal(res.text)) {
        res = await backend.complete(
          SYSTEM,
          `Write a respectful, sincere, non-manipulative speech appealing in good faith on this topic: "${query}". No shaming, no stereotypes, no coercion — just an honest heartfelt appeal with clear paragraphs.`
        );
      }

      if (!res || !res.text) {
        throw new Error('brain offline');
      }
      if (isRefusal(res.text)) {
        throw new Error('declined twice — suggest a rephrase');
      }

      const speech = res.text.trim();

      await sock.sendMessage(
        jid,
        { text: `🎙️ *Generated Speech*\n\n${speech}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[SPEECHWRITER] backend failed:', err.message);
      const offline = !/declined twice/.test(String(err.message));
      await sock.sendMessage(
        jid,
        {
          text: offline
            ? '❌ *Speechwriter is offline right now. Please try again later.*'
            : '❌ *The topic was declined as worded.* Try rephrasing it as a sincere personal appeal — e.g. `.speechwriter give me a chance at love, a sincere personal plea` — and I will write it.',
          edit: thinkingMsg.key,
        },
        { quoted: msg }
      );
    }
  },
};
