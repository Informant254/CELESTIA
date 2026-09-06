/**
 * .webcam — World Eye
 *
 *   .webcam                  → list of live public cams (tappable if native mode)
 *   .webcam <id|name>        → live snapshot from that cam
 *   .webcam random           → surprise location
 *   .webcam near             → reply to a .locate card / coords → nearest cams
 *   .webcam search <query>   → search (Windy global if key set, else TfL names)
 *
 * Sources: TfL JamCams (890 London cams, keyless official) + Windy (optional key, global).
 */
const geo = require('../utils/geoLens');

module.exports = {
  name: 'webcam',
  aliases: ['cam', 'worldcam', 'livecam'],
  description: '📹 World Eye — live public webcams: London streets, landmarks, and more',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const sub = (args[0] || '').toLowerCase();

    // ─── .webcam near (reply to coords / locate card) ───
    if (sub === 'near') {
      let coords = null;
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const qText = (quoted?.conversation || quoted?.extendedTextMessage?.text || '');
      const m = qText.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
      if (m) coords = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
      if (!coords && args[1]) {
        const cm = args.slice(1).join(' ').match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
        if (cm) coords = { lat: parseFloat(cm[1]), lon: parseFloat(cm[2]) };
      }
      if (!coords) {
        return reply('📹 Reply to a *.locate* card (or any message with `lat, lon`) with *.webcam near* — or: *.webcam near -1.2864, 36.8172*');
      }
      try {
        const near = await geo.nearestCams(coords.lat, coords.lon, 3);
        const L = ['📹 *Nearest live cams:*', ''];
        for (const c of near) {
          L.push(`• *${c.name}* _(${c.distKm} km)_`);
          L.push(`  \`.webcam ${c.id}\``);
        }
        return reply(L.join('\n'));
      } catch (e) {
        return reply(`📹 ${e.message}`);
      }
    }

    // ─── .webcam search <query> ───
    if (sub === 'search' && args[1]) {
      const q = args.slice(1).join(' ');
      const windy = await geo.windyWebcams(q);
      if (windy === null) {
        // no key → search TfL names
        try {
          const all = await geo.listCams();
          const hits = all.filter(c => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
          if (!hits.length) return reply(`📹 No cam names match *${q}*.\nGlobal search: set \`WINDY_WEBCAMS_KEY\` in .env (free key: windy.com/webcams → 80k cams).`);
          const L = [`📹 *Name matches for "${q}":*`, ''];
          hits.forEach(c => L.push(`• *${c.name}*\n  \`.webcam ${c.id}\``));
          return reply(L.join('\n'));
        } catch (e) { return reply(`📹 ${e.message}`); }
      }
      if (!windy.length) return reply('📹 No Windy cams matched.');
      const L = ['📹 *Windy cam search:*', ''];
      windy.slice(0, 6).forEach(c => L.push(`• *${c.name}*_${c.city ? `, ${c.city}` : ''}_\n  \`.webcam ${c.id}\``));
      return reply(L.join('\n'));
    }

    // ─── .webcam random ───
    if (sub === 'random' || sub === 'surprise') {
      try {
        const all = await geo.listCams();
        const pick = all[Math.floor(Math.random() * all.length)];
        return sendCam(sock, msg, reply, pick);
      } catch (e) { return reply(`📹 ${e.message}`); }
    }

    // ─── .webcam <id|name> ───
    if (sub && !['list'].includes(sub)) {
      try {
        const cam = await geo.getCam(sub);
        if (!cam) {
          return reply(`📹 No cam matching *${sub}*.\n\`.webcam\` lists everything • \`.webcam search <name>\` finds by name`);
        }
        return sendCam(sock, msg, reply, cam);
      } catch (e) {
        return reply(`📹 ${e.message}`);
      }
    }

    // ─── .webcam — the list ───
    let all;
    try {
      all = await geo.listCams();
    } catch (e) {
      return reply(`📹 Cam catalog unreachable: ${e.message}`);
    }

    const settingsStore = require('../utils/settingsStore');
    if (settingsStore.get('menu_native', false)) {
      try {
        await sock.sendMessage(jid, {
          text: `📹 *World Eye* — ${all.length} live public cams\nPick an eye to look through:`,
          buttonText: '👁️ Open Eye',
          sections: [{
            title: '🌍 Live Cameras',
            rows: all.slice(0, 20).map(c => ({
              title: c.name,
              rowId: `.webcam ${c.id}`,
              description: `${c.type} cam${c.country ? ' • ' + c.country : ''}`,
            })),
          }],
        }, { quoted: msg });
        return;
      } catch { /* fall to text */ }
    }

    const L = [`📹 *WORLD EYE — ${all.length} live public cams*`, ''];
    all.slice(0, 15).forEach(c => {
      L.push(`• *${c.name}*`);
      L.push(`  \`.webcam ${c.id}\``);
    });
    if (all.length > 15) L.push(`… _and ${all.length - 15} more — \`.webcam search <name>\`_`);
    L.push('');
    L.push('🎲 `.webcam random` — surprise location');
    L.push('📍 `.webcam near` (reply to a locate card) — closest cams');
    L.push('🔎 `.webcam search oxford` — find by name');
    return reply(L.join('\n'));
  },
};

async function sendCam(sock, msg, reply, cam) {
  try {
    const { buffer } = await geo.fetchCamImage(cam.url);
    const links = geo.mapLinks(cam.lat, cam.lon, 16);
    const caption = [
      `📹 *${cam.name}*`,
      `📍 ${links.google}`,
      '',
      '🗺️ ' + links.satellite,
      '> 🐺 Public official feed — she only looks where the world already can.',
    ].join('\n');
    await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption }, { quoted: msg });
  } catch (e) {
    // AUTO-FALLBACK: this cam is dead → try up to 2 nearby live cams
    try {
      await reply(`📹 *${cam.name}* — feed offline. _Hunting a nearby live eye..._`);
      const near = await geo.nearestCams(cam.lat, cam.lon, 5);
      for (const alt of near) {
        if (alt.id === cam.id) continue;
        try {
          const { buffer } = await geo.fetchCamImage(alt.url, 1);
          const links = geo.mapLinks(alt.lat, alt.lon, 16);
          const caption = [
            `📹 *${cam.name}* was offline — she switched to the nearest live eye:`,
            `📹 *${alt.name}* _(${alt.distKm} km away)_`,
            `📍 ${links.google}`,
            '',
            '🗺️ ' + links.satellite,
            '> 🐺 Public official feed — she only looks where the world already can.',
          ].join('\n');
          await sock.sendMessage(msg.key.remoteJid, { image: buffer, caption }, { quoted: msg });
          return;
        } catch { /* this alt also dead — next */ }
      }
      await reply(`📹 All nearby feeds are quiet right now. Try \`.webcam random\` — or \`.satellite ${cam.city || 'here'}\` for the orbital view.`);
    } catch { /* fallback itself failed */ }
  }
}
