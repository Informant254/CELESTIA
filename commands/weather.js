const di = require('../utils/dayIntel');

module.exports = {
  name: 'weather',
  aliases: ['wx', 'forecast'],
  description: '🌦️ Weather intelligence — current + 4-day forecast, keyless, anywhere on Earth',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply('🌦️ Usage: *.weather Nairobi* — or any city/landmark on Earth.');
    }
    const place = args.join(' ');
    try {
      const w = await di.weather(place);
      const L = [];
      L.push(`🌦️ *${w.place}* — ${w.now.icon} ${w.now.desc}`);
      L.push('');
      L.push(`🌡️ *${w.now.temp}°C*  (feels ${w.now.feels}°)`);
      L.push(`💧 Humidity ${w.now.humidity}%  •  💨 Wind ${w.now.wind} km/h`);
      if (w.now.precip) L.push(`🌧️ Precipitating now: ${w.now.precip} mm`);
      L.push('');
      L.push('*Next days:*');
      w.daily.slice(1).forEach(d => {
        const [, icon] = di.wmoInfo(d.code);
        const dayName = new Date(d.date).toLocaleDateString([], { weekday: 'short' });
        L.push(`${icon} *${dayName}*  ${Math.round(d.min)}–${Math.round(d.max)}°C  ☔${d.rain ?? 0}%`);
      });
      if (w.daily[0]?.sunrise) {
        const sr = w.daily[0].sunrise.slice(11, 16);
        const ss = w.daily[0].sunset.slice(11, 16);
        L.push('');
        L.push(`🌅 ${sr}  •  🌇 ${ss}  _(${w.timezone})_`);
      }
      L.push('');
      L.push('> 🐺 Open-Meteo — the forecast she trusts.');
      return reply(L.join('\n'));
    } catch (e) {
      return reply(`🌦️ ${e.message}`);
    }
  },
};
