/**
 * .numerology / .fortune — the mystic pair
 */
const mystic = require('../utils/mystic');

module.exports = {
  name: 'numerology',
  aliases: ['numbers'],
  description: '🔮 Life-path number from a number or name — real Pythagorean math',
  async execute(sock, msg, args, commands, reply) {
    const input = args.join(' ').trim();
    if (!input) {
      return reply('🔮 *.numerology 07082001* — a date/number\n*.numerology Jane Doe* — a name\n\n_Reduced to a single digit with real meanings._');
    }
    const r = mystic.numerology(input);
    return reply(
      `🔮 *NUMEROLOGY — ${r.input}*\n\n` +
      `Raw sum: ${r.raw}\n` +
      `Life number: *${r.life}*\n\n` +
      `${r.title} — _${r.meaning}_`
    );
  },
};
