/**
 * .horoscope — daily-seeded, consistent all day
 *
 *   .horoscope leo           → today's reading
 *   .horoscope               → the zodiac wheel
 */
const mystic = require('../utils/mystic');

module.exports = {
  name: 'horoscope',
  aliases: ['zodiacread', 'stars'],
  description: '🔮 Daily horoscope — same reading all day, fresh at midnight',
  async execute(sock, msg, args, commands, reply) {
    const sign = (args[0] || '').toLowerCase();

    if (!sign) {
      const L = ['🔮 *THE WHEEL*', ''];
      mystic.ZODIAC.forEach(([name, dates, glyph]) => {
        L.push(`${glyph} *${name}* — ${dates}`);
      });
      L.push('', '_Your sign: `.horoscope leo`_');
      return reply(L.join('\n'));
    }

    const h = mystic.horoscope(sign, mystic.todaySeed());
    if (!h) return reply('🔮 Unknown sign. `.horoscope` lists the wheel.');

    const bar = '█'.repeat(Math.round(h.energy / 12)) + '░'.repeat(Math.max(0, 8 - Math.round(h.energy / 12)));
    return reply(
      `🔮 ${h.glyph} *${h.name.toUpperCase()}* — ${h.dates}\n` +
      `_${h.motto}_\n\n` +
      `"${h.reading}"\n\n` +
      `⚡ Energy: [${bar}] ${h.energy}%\n` +
      `🍀 Lucky number: *${h.lucky}*\n\n` +
      `_Same reading all day — the sky moves at midnight._`
    );
  },
};
