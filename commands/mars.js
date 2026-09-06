/**
 * .mars — weather on Mars + .iss — the station overhead
 */
const space = require('../utils/space');

module.exports = {
  name: 'mars',
  description: '🔴 Live-ish Mars weather — from NASA InSight\'s final mission data',
  async execute(sock, msg, args, commands, reply) {
    try {
      const m = await space.mars();
      const L = [
        '🔴 *MARS — SOL ' + m.sol + '*',
        `🍂 Season: ${m.season || 'n/a'}`,
        '',
        `🌡️ Avg temp: *${m.temp ?? '?'}°C* (${m.tempMin ?? '?'}° to ${m.tempMax ?? '?'}°)`,
        `💨 Wind: ${m.wind ? m.wind + ' m/s' : 'n/a'}`,
        `📊 Pressure: ${m.pressure ? m.pressure + ' Pa' : 'n/a'}`,
        '',
        `_${m.note}_`,
        '> 🐺 Thin air, red dust, and a robot that outworked its batteries.',
      ];
      return reply(L.join('\n'));
    } catch (e) {
      return reply(`🔴 Mars data unreachable: ${e.message}`);
    }
  },
};
