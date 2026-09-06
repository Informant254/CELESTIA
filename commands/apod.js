/**
 * .apod — NASA's Astronomy Picture of the Day (with image)
 */
const space = require('../utils/space');

module.exports = {
  name: 'apod',
  aliases: ['spacepic', 'astropic'],
  description: '🚀 NASA Astronomy Picture of the Day — the cosmos, daily',
  async execute(sock, msg, args, commands, reply) {
    try {
      const d = await space.apod();
      if (d.type !== 'image') {
        return reply(`🚀 *${d.title}* (${d.date})\n\n${d.explanation}\n\n🎬 Video: ${d.url}`);
      }
      const axios = require('axios');
      const res = await axios.get(d.url, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': 'CELESTIA' } });
      const caption = [
        `🌌 *${d.title}*`,
        `📅 ${d.date} • © ${d.copyright}`,
        '',
        d.explanation.slice(0, 900),
        '',
        '> 🐺 The universe posts daily. She delivers.',
      ].join('\n');
      await sock.sendMessage(msg.key.remoteJidAlt || msg.key.remoteJid, { image: Buffer.from(res.data), caption }, { quoted: msg });
    } catch (e) {
      return reply(`🚀 APOD failed: ${e.message}\n_(NASA demo-key rate limits reset hourly — try again shortly.)_`);
    }
  },
};
