module.exports = {
  name: 'attp',
  description: 'Animated text sticker. Usage: .attp <text>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!process.env.LOLHUMAN_API_KEY) {
      return sock.sendMessage(
        jid,
        { text: '⚠️ Animated text stickers are unavailable because LOLHUMAN_API_KEY is not configured.' },
        { quoted: msg }
      );
    }

    if (!text) {
      return sock.sendMessage(jid, { text: 'Provide text. E.g: .attp Hello World' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, {
        sticker: { url: `https://api.lolhuman.xyz/api/attp?apikey=${encodeURIComponent(process.env.LOLHUMAN_API_KEY)}&text=${encodeURIComponent(text)}` }
      }, { quoted: msg });
    } catch {
      console.error('[ATTP ERROR] Sticker request failed.');
      await sock.sendMessage(jid, { text: '❌ Failed to create the animated text sticker.' }, { quoted: msg });
    }
  },
};

