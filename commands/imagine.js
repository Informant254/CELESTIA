const axios = require('axios');

module.exports = {
  name: 'imagine',
  aliases: ['createimage', 'dalle'],
  description: 'Generate AI image (dalle/imagine)',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    let prompt = args.join(' ').trim();

    if (!prompt) {
      return await sock.sendMessage(
        jid,
        {
          text: `Usage Example: ${config.prefix}imagine beautiful anime girl in a forest\n\nFlags you can add:\n  --wide   → landscape (1024×576)\n  --tall   → portrait (576×1024)\n  --turbo  → faster, less detail\n\nDefault size is square (512×512)`,
        },
        { quoted: msg }
      );
    }

    try {
      await sock.sendMessage(jid, { text: '🎨 Generating your image, please wait...' }, { quoted: msg });

      let width = 512, height = 512;
      let model = 'flux';

      if (prompt.includes('--wide')) { width = 1024; height = 576; prompt = prompt.replace('--wide', '').trim(); }
      if (prompt.includes('--tall')) { width = 576; height = 1024; prompt = prompt.replace('--tall', '').trim(); }
      if (prompt.includes('--turbo')) { model = 'turbo'; prompt = prompt.replace('--turbo', '').trim(); }

      const seed = Math.floor(Math.random() * 999999);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;

      const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const caption = `*Model:* ${model === 'turbo' ? 'Flux Turbo ⚡' : 'Flux ✨'}\n*Size:* ${width}×${height}px`;

      await sock.sendMessage(jid, { image: Buffer.from(res.data), caption }, { quoted: msg });
    } catch (error) {
      console.error('[IMAGINE ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Something went wrong generating the image. Try again later.' }, { quoted: msg });
    }
  },
};
