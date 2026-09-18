const backend = require('../autochat/backend');

module.exports = {
  name: 'vision',
  aliases: ['imgai', 'analyze', 'geminivision'],
  description: 'Analyze an image with Vision AI (quote an image)',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const question = args.join(' ').trim();

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(
        jid,
        { text: '📌 Reply to an image with a question.\nExample: *.vision what is this?*' },
        { quoted: msg }
      );
    }

    if (!question) {
      return await sock.sendMessage(
        jid,
        { text: '❌ Provide a question about the image!\nExample: *.vision what is in this image?*' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: '👁️ *Analyzing your image...*' },
      { quoted: msg }
    );

    try {
      // Text-only backend: image bytes cannot be understood. Never hallucinate contents.
      const res = await backend.complete(
        'You are Vision AI, an image-analysis assistant whose image input is currently unavailable. The user asked a question about an image you cannot see. Briefly explain you cannot see the image right now, do NOT invent or guess what is in it, and give the most useful general guidance you can from the question text alone. Invite them to describe the image in words so you can help. Keep it short and WhatsApp-friendly.',
        `The user asked this about an image I cannot see: "${question}". Explain image understanding is unavailable and help as best you can without guessing the image contents.`
      );

      const body = (res && res.text)
        ? res.text.trim()
        : 'Image understanding is unavailable right now, so I cannot see this image. Describe what is in it with words and I will do my best to help with your question.';

      await sock.sendMessage(
        jid,
        { text: `👁️ *Vision Analysis*\n\n${body}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[VISION ERROR]', error.message);
      await sock.sendMessage(
        jid,
        { text: '❌ Vision AI is offline right now. Please try again later.', edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
