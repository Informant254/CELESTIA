/**
 * .iss — where the International Space Station is RIGHT NOW
 *   .iss pass Nairobi   → when it crosses YOUR sky next
 */
const space = require('../utils/space');
const geo = require('../utils/geoLens');

module.exports = {
  name: 'iss',
  aliases: ['station'],
  description: '🚀 The ISS — live position now, or .iss pass <city> for your next overhead crossing',
  async execute(sock, msg, args, commands, reply) {
    const sub = (args[0] || '').toLowerCase();

    // ─── overhead pass ───
    if (sub === 'pass' || sub === 'overhead') {
      const place = args.slice(1).join(' ').trim();
      if (!place) return reply('🚀 Where are you? `.iss pass Nairobi`');
      try {
        const r = await geo.geocode(place, 1);
        if (!r.length) return reply('🚀 Unknown place.');
        const best = await space.issPass(r[0].lat, r[0].lon, 100);
        if (!best) return reply('🚀 Couldn\'t compute the pass (API busy). Try again.');
        if (best.dist > 2000) {
          return reply(`🚀 No close pass within the next ~100 minutes (closest: ${Math.round(best.dist)} km away at ${best.at.toLocaleTimeString()}). ISS orbits every 92.7 min — try again later.`);
        }
        return reply(
          `🚀 *ISS OVERHEAD — ${r[0].name.split(',')[0]}*\n\n` +
          `⏰ ~${best.at.toLocaleTimeString()} (in ${Math.max(1, Math.round((best.at.getTime() - Date.now()) / 60000))} min)\n` +
          `📏 Closest approach: *${Math.round(best.dist)} km* away\n\n` +
          `_[Look up — a bright dot moving like a plane, but silent.]_`
        );
      } catch (e) { return reply(`🚀 ${e.message}`); }
    }

    // ─── live position ───
    try {
      const d = await space.issNow();
      return reply(
        `🚀 *THE ISS — RIGHT NOW*\n\n` +
        `📍 Over: *${d.place}*\n` +
        `🧭 ${d.lat.toFixed(2)}, ${d.lon.toFixed(2)}\n` +
        `💨 Speed: ${d.velocity.toLocaleString()} km/h\n` +
        `↕️ Altitude: ${Math.round(d.altitude)} km\n\n` +
        `🗺️ ${d.map.google}\n\n` +
        `🛰️ \`.iss pass Nairobi\` — when it crosses YOUR sky`
      );
    } catch (e) {
      return reply(`🚀 ISS unreachable: ${e.message}`);
    }
  },
};
