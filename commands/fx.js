const di = require('../utils/dayIntel');

module.exports = {
  name: 'fx',
  aliases: ['rate', 'exchange'],
  description: '💱 Live FX — .fx USD KES • .fx EUR USD',
  execute: async (sock, msg, args, commands, reply) => {
    if (args.length < 2) {
      return reply('💱 Usage: *.fx USD KES* — live mid-market rate.');
    }
    try {
      const r = await di.fxRate(args[0], args[1]);
      // nice inverse too
      const inv = (1 / r.rate);
      const fmt = (n) => n >= 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(4);
      return reply(
        `💱 *${r.from}/${r.to}*\n\n` +
        `1 ${r.from} = *${fmt(r.rate)}* ${r.to}\n` +
        `1 ${r.to} = ${fmt(inv)} ${r.from}\n\n` +
        `_Mid-market • ${r.updated}_\n` +
        '> 🐺 For conversion math: 100 ' + r.from + ' ≈ ' + (100 * r.rate).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + r.to
      );
    } catch (e) {
      return reply(`💱 ${e.message}`);
    }
  },
};
