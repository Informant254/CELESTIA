module.exports = {
  name: 'ping',
  aliases: ['p', 'latency'],
  description: 'Ping the bot (merged wolf+CELESTIA)',
  execute: async (sock, msg, args, commands, reply) => {
    const start = Date.now();
    await reply('🏓 Pinging...');
    const latency = Date.now() - start;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    await reply(`🐺 *MERGED BOT* Pong!\n⚡ Latency: ${latency}ms\n⏱ Uptime: ${hours}h ${mins}m\n🤖 CELESTIA + CELESTIA + Spam`);
  }
};
