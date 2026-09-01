module.exports = {
  name: 'attp',
  description: 'Animated text sticker. Usage: .attp <text>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(jid, { text: 'Provide text. E.g: .attp Hello World' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, {
        sticker: { url: `https://api.lolhuman.xyz/api/attp?apikey=cde5404984da80591a2692b6&text=${encodeURIComponent(text)}` }
      }, { quoted: msg });
    } catch (err) {
      console.error('[ATTP ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Failed to create sticker: ' + err.message }, { quoted: msg });
    }
  },
};

