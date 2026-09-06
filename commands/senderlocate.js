/**
 * .senderlocate — where is the sender of this message?
 *
 *   .senderlocate (reply)       → full card for the replied-to sender
 *   .senderlocate <number>      → card for a raw number
 *
 * What she CAN tell you (all legitimately available):
 *   - Country from the number's public dialing code → flag, capital, map
 *   - If that message itself contains a shared location pin → exact coords
 *
 * What she CANNOT (WhatsApp doesn't transmit it):
 *   - Real-time GPS of a phone from an ordinary message
 */
const geo = require('../utils/geoLens');

module.exports = {
  name: 'senderlocate',
  aliases: ['slocate', 'whereis', 'locateuser'],
  description: '📍 Locate a message sender — country from their number, or exact spot if they shared a pin',
  execute: async (sock, msg, args, commands, reply) => {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const senderJid = ctx?.participant;
    const senderAlt = ctx?.participantAlt || ctx?.remoteJidAlt;

    let targetNumber = null;
    let pinLocation = null;
    let senderLabel = null;

    // ─── Reply mode: inspect the quoted message ───
    if (quoted) {
      const num = (senderAlt || senderJid || '').split('@')[0].split(':')[0];
      targetNumber = num;
      senderLabel = ctx?.participant ? 'the replied-to sender' : 'the sender';

      // Did THEY share a location pin in that message?
      const loc = quoted.locationMessage?.degreesLatitude
        ? quoted.locationMessage
        : quoted.liveLocationMessage?.degreesLatitude
          ? quoted.liveLocationMessage
          : null;
      if (loc) {
        pinLocation = {
          lat: loc.degreesLatitude,
          lon: loc.degreesLongitude,
          live: !!quoted.liveLocationMessage,
          caption: loc.caption || null,
        };
      }
    }

    // ─── Number mode ───
    if (!targetNumber && args[0]) {
      targetNumber = args[0].replace(/\D/g, '');
      senderLabel = 'that number';
    }

    if (!targetNumber) {
      return reply(
        '📍 *Sender Locate*\n\n' +
        'Reply to any message with *.senderlocate* — or *.senderlocate 2547XXXXXXXX*\n\n' +
        '_What she finds: country from the number\'s dialing code (flag, capital, map), plus the exact spot if they shared a location pin._\n' +
        '_WhatsApp never transmits a phone\'s GPS with normal messages — anyone claiming otherwise is selling spyware._'
      );
    }

    const L = ['📍 *SENDER LOCATE*', ''];

    // ─── Case 1: they shared an actual pin ───
    if (pinLocation) {
      const links = geo.mapLinks(pinLocation.lat, pinLocation.lon, 16);
      let placeName = 'Shared location';
      try {
        const rev = await geo.reverseGeocode(pinLocation.lat, pinLocation.lon);
        placeName = rev.name;
      } catch {}
      const time = await geo.placeTime(pinLocation.lat, pinLocation.lon).catch(() => null);

      L.push(`🎯 *Exact location* — ${senderLabel} shared ${pinLocation.live ? 'a *live* location' : 'a pin'}${pinLocation.caption ? ` _"${pinLocation.caption}"_` : ''}`);
      L.push('');
      L.push(`📍 ${placeName}`);
      L.push(`🧭 \`${pinLocation.lat.toFixed(5)}, ${pinLocation.lon.toFixed(5)}\``);
      L.push('');
      L.push(`🗺️ Google: ${links.google}`);
      L.push(`🛰️ Satellite: ${links.satellite}`);
      L.push(`👁️ Street: ${links.streetView}`);
      if (time) L.push(`🕐 Local: ${time.time} (${time.timezone})`);
      L.push('');
      L.push('> 🐺 From their own shared pin — this is their real chosen spot.');
      return reply(L.join('\n'));
    }

    // ─── Case 2: country-level from dialing code ───
    const info = geo.phoneCountry(targetNumber);
    if (!info) {
      return reply(`📍 Couldn't parse *${targetNumber}* as a phone number. Use reply mode or full international format.`);
    }

    const links = geo.mapLinks(info.lat, info.lon, info.city ? 11 : 5);
    const time = await geo.placeTime(info.lat, info.lon).catch(() => null);

    L.push(`📞 \`${info.number}\` — ${senderLabel}`);
    L.push('');
    L.push(`${info.flag || '🌐'} *Country:* ${info.country}`);
    if (info.city) {
      L.push(`🏙️ Area code ${info.areaCode} → *${info.city}*`);
      L.push(`🧭 Precision: city-level (from the public area code)`);
    } else {
      L.push(`🏙️ Capital: ${info.capital}`);
      L.push(`🧭 Precision: country-level (from the dialing code)`);
    }
    L.push(`📶 Dial: ${info.dialCode}`);
    if (time) L.push(`🕐 Time there: ${time.time} (${time.timezone})`);
    L.push('');
    L.push(`🗺️ On the map: ${links.google}`);
    L.push('');
    L.push('⚠️ _From the number\'s public numbering plan only. If they share a location pin, reply to THAT message for the exact spot._');
    L.push('> 🐺 She reads what the number openly says — never more.');
    return reply(L.join('\n'));
  },
};
