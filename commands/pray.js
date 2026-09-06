const di = require('../utils/dayIntel');

module.exports = {
  name: 'pray',
  aliases: ['salah', 'prayertimes'],
  description: '🕌 Prayer times + Qibla direction for any city (Aladhan, keyless)',
  execute: async (sock, msg, args, commands, reply) => {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'qibla') {
      const place = args.slice(1).join(' ') || 'Nairobi';
      try {
        const deg = await di.qiblaDirection(place);
        const compass = ['N ⬆️','NE ↗️','E ➡️','SE ↘️','S ⬇️','SW ↙️','W ⬅️','NW ↖️'][Math.round(deg / 45) % 8];
        return reply(`🕌 *Qibla — ${place}*\n\n🧭 ${deg.toFixed(1)}° from North\n${compass}\n\n> _Face ${compass.split(' ')[0]} and you face the Kaaba._`);
      } catch (e) { return reply(`🕌 ${e.message}`); }
    }

    if (!args.length) {
      return reply('🕌 Usage: *.pray Nairobi* — or *.pray qibla Nairobi* for direction');
    }

    try {
      const p = await di.prayerTimes(args.join(' '));
      const L = [];
      L.push(`🕌 *Prayer Times — ${p.place}*`);
      L.push(`📅 ${new Date().toLocaleDateString()} • ${p.hijri}`);
      L.push('');
      for (const [key, label] of Object.entries(PRAYER_ORDER)) {
        const t = (p.times[key] || '').split(' ')[0]; // strip timezone suffix
        L.push(`${label.icon} *${key}* — ${t}  _${label.sub}_`);
      }
      L.push('');
      L.push(`🧭 Qibla: \`.pray qibla ${p.place}\``);
      L.push(`📐 Method: ${p.method}`);
      L.push('> _She keeps the timings; you keep the moments._');
      return reply(L.join('\n'));
    } catch (e) {
      return reply(`🕌 ${e.message}`);
    }
  },
};

const PRAYER_ORDER = {
  Fajr: { icon: '🌅', sub: 'dawn' },
  Sunrise: { icon: '🌇', sub: 'sunrise' },
  Dhuhr: { icon: '☀️', sub: 'noon' },
  Asr: { icon: '🌤️', sub: 'afternoon' },
  Maghrib: { icon: '🌆', sub: 'sunset' },
  Isha: { icon: '🌙', sub: 'night' },
};
