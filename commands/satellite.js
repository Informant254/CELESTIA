/**
 * .satellite — Sat Lens 🛰️
 *
 *   .satellite Nairobi              → hi-res satellite lock on any place
 *   .satellite -1.2864, 36.8172     → coordinates targeting
 *   .satellite Nairobi max          → max zoom (building-level where imagery allows)
 *   .satellite Nairobi low          → wide-area view (zoom 12)
 *   .satellite Nairobi live         → NASA's ACTUAL orbital pass from yesterday (clouds, weather)
 *   .satellite reply (to locate)    → use coords from a locate card
 */
const sat = require('../utils/satLens');

module.exports = {
  name: 'satellite',
  aliases: ['sat', 'satspy', 'orbital'],
  description: '🛰️ Sat Lens — satellite lock on any point on Earth. Esri sub-meter + NASA live passes',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
    const parts = args.join(' ').trim();

    if (!parts) {
      return reply(
        '🛰️ *SAT LENS — orbital targeting*\n\n' +
        '• *.satellite Nairobi* — hi-res lock\n' +
        '• *.satellite -1.2864, 36.8172* — coordinates\n' +
        '• *.satellite Nairobi max* — building-level\n' +
        '• *.satellite Nairobi low* — wide area\n' +
        '• *.satellite Nairobi live* — NASA\'s actual pass from yesterday (see the clouds)\n\n' +
        '_Keyless. Crosshair marks the exact point. Esri sub-meter imagery; NASA GIBS live passes._'
      );
    }

    // parse modifiers
    let zoom = 15;
    let source = 'esri';
    let target = parts;

    const zoomWords = [
      { re: /\bmax\b|\bextreme\b|\bzoom18\b/i, z: 18 },
      { re: /\bhigh\b|\bclose\b/i, z: 16 },
      { re: /\blow\b|\bwide\b|\bfar\b/i, z: 12 },
      { re: /\bcity\b/i, z: 13 },
    ];
    for (const w of zoomWords) {
      if (w.re.test(parts)) { zoom = w.z; target = target.replace(w.re, '').trim(); break; }
    }
    if (/\blive\b|\bnasa\b|\borbit\b/i.test(parts)) {
      source = 'nasa';
      zoom = Math.min(zoom, 9); // GIBS caps at 9
      target = target.replace(/\blive\b|\bnasa\b|\borbit\b/i, '').trim();
    }
    // coords from a replied locate card
    if (!target || target === '') {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const qt = (quoted?.conversation || quoted?.extendedTextMessage?.text || '');
      const m = qt.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
      if (m) target = `${m[1]}, ${m[2]}`;
    }
    if (!target) return reply('🛰️ Target needed: *.satellite Nairobi*');

    await reply(`🛰️ *Acquiring target:* \`${target}\`...`);

    try {
      const r = await sat.satelliteFor(target, { zoom, source });
      const caption = [
        `🛰️ *SAT LENS — TARGET LOCKED*`,
        ``,
        `📍 *${r.placeName.split(',').slice(0, 3).join(',')}*`,
        `🎯 \`${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}\` — crosshair = exact point`,
        `🔍 zoom ${r.zoom} • ${r.source}`,
        ``,
        `🗺️ ${r.maps.google}`,
        `🛰️ ${r.maps.satellite}`,
        ``,
        `_${r.credit}_`,
      ].join('\n');
      await sock.sendMessage(jid, { image: r.buffer, caption }, { quoted: msg });
    } catch (e) {
      return reply(`🛰️ Acquisition failed: ${e.message}\n\n_Try a city name or "lat, lon". Lower zoom (.low) if imagery is thin there._`);
    }
  },
};
