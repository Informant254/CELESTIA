const wolfTech = require('../utils/wolfTech');

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
      `╭─── 🏓 *PONG* ───╮\n` +
      `│ ⚡ Latency: *${latency}ms*\n` +
      `│ ⏱ Uptime: *${hours}h ${mins}m*\n` +
      `│ 🤖 CELESTIA ✨ Heavenly\n` +
      `╰─────────────────╯\n` +
      `🐺 *WolfTech DNA* active • ✨ Celestia Soul shining\n` +
      `> _${wolfTech.tribute.tagline}_\n` +
      `> _${wolfTech.getRandomFooter()}_`
    );
  }
};
