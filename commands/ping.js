const wolfTech = require('../utils/wolfTech');
const ui = require('../utils/ui');

module.exports = {
  name: 'ping',
  aliases: ['p', 'latency'],
  description: 'Ping the bot (WolfTech inspired — Celestia reborn)',
  execute: async (sock, msg, args, commands, reply) => {
    const start = Date.now();
    await reply('🏓 *Pinging the heavens...* 🐺✨');
    const latency = Date.now() - start;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    await reply(
      ui.renderCard('🏓 PONG', [
        ui.renderInfo('⚡', 'Latency', `${latency}ms`),
        ui.renderInfo('⏱', 'Uptime', `${hours}h ${mins}m`),
        '🤖 CELESTIA ✨ Heavenly',
      ]) +
      `\n• 🐺 WolfTech DNA active · ✨ Celestia Soul shining\n` +
      `• ${wolfTech.tribute.tagline}\n` +
      `• ${wolfTech.getRandomFooter()}`
    );
  }
};
