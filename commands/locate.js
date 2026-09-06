/**
 * .locate — Geo Lens command
 *
 *   .locate <place>          → full place card: coords, maps links, local time, sun
 *   .locate <lat>, <lon>     → reverse lookup: what place is this?
 *   .locate <place> quick    → just coords + google link
 *
 * Works with cities, landmarks, addresses, countries — anything Nominatim knows.
 */
const geo = require('../utils/geoLens');

module.exports = {
  name: 'locate',
  aliases: ['where', 'geo', 'place', 'maps'],
  description: '🌍 Locate any place — Google Maps, satellite, local time, sunrise/sunset',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const quick = args[args.length - 1]?.toLowerCase() === 'quick';
    let query = args.join(' ').replace(/\s+quick$/i, '').trim();

    if (!query) {
      return reply(
        '🌍 *Geo Lens — Place Intelligence*\n\n' +
        '• *.locate Nairobi* — full place card\n' +
        '• *.locate Eiffel Tower* — landmarks work too\n' +
        '• *.locate -1.2864, 36.8172* — reverse lookup coords\n' +
        '• *.locate Nairobi quick* — coords + map link only\n\n' +
        'Each card: Google Maps 🗺️ • satellite 🛰️ • Street View 👁️ • OSM • local time 🕐 • sunrise/sunset 🌅'
      );
    }

    try {
      let lat, lon, placeName;

      // ─── Coordinates input ───
      const coordMatch = query.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
      if (coordMatch) {
        lat = parseFloat(coordMatch[1]);
        lon = parseFloat(coordMatch[2]);
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
          return reply('🌍 Invalid coordinates. Lat range: -90..90, Lon: -180..180');
        }
        const rev = await geo.reverseGeocode(lat, lon);
        placeName = rev.name;
      } else {
        // ─── Place-name geocode ───
        const results = await geo.geocode(query, 1);
        if (!results.length) {
          return reply(`🌍 No place found for *"${query}"*.\nTry a city, landmark, or "lat, lon" coordinates.`);
        }
        const r = results[0];
        lat = r.lat; lon = r.lon;
        placeName = r.name;
      }

      const links = geo.mapLinks(lat, lon);

      // ─── QUICK mode ───
      if (quick) {
        return reply(
          `🌍 *${placeName.split(',')[0]}*\n` +
          `📍 \`${lat.toFixed(4)}, ${lon.toFixed(4)}\`\n` +
          `🗺️ ${links.google}`
        );
      }

      // ─── FULL place card ───
      const L = [];
      L.push('🌍 *GEO LENS*');
      L.push('');
      L.push(`📍 *${placeName}*`);
      L.push(`🧭 \`${lat.toFixed(5)}, ${lon.toFixed(5)}\``);
      L.push('');
      L.push('*🗺️ Maps:*');
      L.push(`• Google: ${links.google}`);
      L.push(`• OpenStreetMap: ${links.osm}`);
      L.push('');
      L.push('*🛰️ Views:*');
      L.push(`• Satellite: ${links.satellite}`);
      L.push(`• Street View: ${links.streetView}`);
      L.push(`• Google Earth: ${links.earth}`);
      L.push('');

      // Local time (best-effort)
      try {
        const t = await geo.placeTime(lat, lon);
        if (t) {
          L.push(`🕐 *Local time:* ${t.time} (${t.timezone || 'local'}) — ${t.date}`);
        }
      } catch {}

      // Sun times (offline math)
      const sun = geo.sunTimes(lat, lon);
      if (sun.sunrise) {
        L.push(`🌅 *Sun:* rises ~${sun.sunrise} • sets ~${sun.sunset} _(${sun.note})_`);
      } else if (sun.note) {
        L.push(`🌅 _${sun.note}_`);
      }

      L.push('');
      L.push('> 🐺 Places, not people — she geocodes the world, never stalks it.');
      return reply(L.join('\n'));
    } catch (e) {
      return reply(`🌍 ${e.message.includes('No place') ? e.message : `Lookup failed: ${e.message}`}`);
    }
  },
};
