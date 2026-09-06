/**
 * .briefing — THE HERALD 📰
 *
 * One morning card, everything that matters:
 *   - Weather for your city
 *   - Prayer times (Fajr done, what's next)
 *   - Top crypto moves
 *   - HN trending (live supply)
 *   - CISA KEV newest (if any critical)
 *   - Your habits that need check-in
 *   - Your capsules/reminders today
 *   - A quote + her mood line
 *
 *   .briefing           → the card
 *   .briefing set Nairobi → your briefing city (owner)
 */
const di = require('../utils/dayIntel');
const tk = require('../utils/timekeeper');
const soul = require('../utils/celestiaSoul');
const portal = require('../utils/portal');
const settingsStore = require('../utils/settingsStore');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'briefing',
  aliases: ['herald', 'morning', 'daily'],
  description: '📰 The Herald — your morning briefing: weather, prayers, markets, trending, habits',
  execute: async (sock, msg, args, commands, reply) => {
    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
    const sub = (args[0] || '').toLowerCase();

    // ─── set city ───
    if (sub === 'set' && args[1]) {
      if (!isOwner(msg)) return reply('📰 _She briefs one._');
      settingsStore.set('briefing_city', args.slice(1).join(' '));
      return reply(`📰 Herald city set: *${args.slice(1).join(' ')}*`);
    }

    const city = settingsStore.get('briefing_city', 'Nairobi');

    // ─── build the card (each section best-effort, never crashes) ───
    const L = [];
    const now = new Date();
    const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
    L.push(`📰 *THE HERALD* — ${greeting}.`);
    L.push(`_${now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}_`);
    L.push('');

    // ── weather ──
    try {
      const w = await di.weather(city);
      const t = w.daily[0];
      L.push(`${w.now.icon} *${w.place}:* ${w.now.temp}°C ${w.now.desc}`);
      L.push(`   ${Math.round(t.min)}–${Math.round(t.max)}°C • ☔${t.rain ?? 0}% • 🌅 ${t.sunrise?.slice(11, 16)}`);
      L.push('');
    } catch { L.push(`🌦️ weather unavailable`, ''); }

    // ── prayer ──
    try {
      const p = await di.prayerTimes(city);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let next = null;
      for (const k of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
        const [h, m] = (p.times[k] || '0:0').split(' ')[0].split(':').map(Number);
        if (h * 60 + m > nowMin) { next = { k, h, m }; break; }
      }
      if (next) {
        L.push(`🕌 Next prayer: *${next.k}* at ${next.h}:${String(next.m).padStart(2, '0')} — in ${Math.floor((next.h * 60 + next.m - nowMin) / 60)}h ${(next.h * 60 + next.m - nowMin) % 60}m`);
      } else {
        L.push(`🕌 Tomorrow's Fajr: ${p.times.Fajr?.split(' ')[0]}`);
      }
      L.push('');
    } catch { /* skip */ }

    // ── habits needing check-in ──
    try {
      const habits = tk.getHabits(ownerJid);
      const pending = Object.values(habits).filter(h => h.lastCheck !== tk.todayKey());
      if (pending.length) {
        L.push(`🔥 Habits waiting: ${pending.map(h => h.name).join(', ')}`);
        L.push('');
      }
    } catch { /* skip */ }

    // ── reminders due today ──
    try {
      const dueToday = tk.listReminders(ownerJid).filter(r => new Date(r.dueTs).toDateString() === now.toDateString());
      const capsulesToday = tk.listCapsules(ownerJid).filter(c => new Date(c.dueTs).toDateString() === now.toDateString());
      if (dueToday.length || capsulesToday.length) {
        if (dueToday.length) L.push(`⏰ Today: ${dueToday.map(r => r.text.slice(0, 25)).join(' • ')}`);
        if (capsulesToday.length) L.push(`🕰️ Capsules open today: ${capsulesToday.length}`);
        L.push('');
      }
    } catch { /* skip */ }

    // ── crypto top movers ──
    try {
      const top = await di.topCrypto(5);
      const btc = top[0];
      const movers = top.slice(0, 3).map(c => `${c.sym} ${c.change >= 0 ? '🟢' : '🔴'}${c.change.toFixed(1)}%`).join(' ');
      L.push(`💱 ${btc.sym} ${btc.price >= 1 ? '$' + Math.round(btc.price).toLocaleString() : '$' + btc.price.toPrecision(3)} — ${movers}`);
      L.push('');
    } catch { /* skip */ }

    // ── trending (HN via portal supply) ──
    try {
      const { supply } = await portal.refreshSupply();
      const hn = (supply.hn || []).slice(0, 3);
      if (hn.length) {
        L.push(`🔥 Trending now:`);
        hn.forEach(h => L.push(`   • ${h.name.slice(0, 60)}`));
        L.push('');
      }
    } catch { /* skip */ }

    // ── CISA KEV latest ──
    try {
      const kevCache = settingsStore.get('kev_cache', null);
      // lightweight: just mention count is stale-safe
      const fortress = require('../utils/cyberFortress');
      const kev = await fortress.kevList();
      if (kev.recent?.length) {
        L.push(`🛡️ Newest KEV: *${kev.recent[0].cveID}* — ${kev.recent[0].vendorName}/${kev.recent[0].productName} (actively exploited)`);
        L.push('');
      }
    } catch { /* skip */ }

    // ── her line ──
    const s = soul.speak();
    L.push(`${s.icon} _"${s.line}"_`);
    L.push('');
    L.push('> 📰 _Set city: `.briefing set Nairobi`_');

    return reply(L.join('\n'));
  },
};
