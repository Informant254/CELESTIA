/**
 * .portal — the living web atlas
 *
 *   .portal               → rotating cross-category picks (never the same)
 *   .portal <category>    → learn / tools / dev / media / security / ai / life
 *   .portal trending      → live: GitHub Trending + Hacker News right now
 *   .portal github        → GitHub Trending only
 *   .portal random        → one perfect random site
 *   .portal stats         → what the market demands (demand/supply telemetry)
 *
 * Demand-driven: every view nudges momentum; rotation is weighted by it.
 */
const portal = require('../utils/portal');
const settingsStore = require('../utils/settingsStore');

module.exports = {
  name: 'portal',
  aliases: ['sites', 'webportal', 'goodies'],
  description: '🌀 The Portal — a living, demand-driven atlas of insanely good free websites',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const sub = (args[0] || '').toLowerCase();

    const fmtPick = (p, i) => {
      const star = { seed: '✦', github: '⭐', hn: '🔥' }[p.source] || '•';
      const meta = p.stars != null ? ` _(${p.stars}★ today)_` : p.comments != null ? ` _(${p.comments} comments)_` : '';
      const cat = p.cat ? ` ${portalCatIcon(p.cat)}` : '';
      return `${star} *${p.name}*${cat}${meta}\n    ${p.url}\n    _${p.why}_`;
    };
    const portalCatIcon = (key) => portal.CATEGORIES.find(c => c.key === key)?.icon || '🌀';

    // ─── .portal trending / github ───
    if (sub === 'trending' || sub === 'github' || sub === 'hn') {
      const { picks } = await portal.trendingPicks();
      const filtered = sub === 'github' ? picks.filter(p => p.source === 'github')
        : sub === 'hn' ? picks.filter(p => p.source === 'hn')
        : picks;
      if (!filtered.length) {
        return reply('🌀 Trending sources unreachable right now (GitHub mirror / HN API). Try again shortly — cached picks refresh hourly.');
      }
      const L = ['🌀 *THE PORTAL — trending supply*', '_what the world finds good, right now_', ''];
      filtered.forEach((p, i) => L.push(fmtPick(p, i)));
      L.push('', '> 🐺 Live demand meets live supply. `.portal` for the evergreen vault.');
      return reply(L.join('\n'));
    }

    // ─── .portal random ───
    if (sub === 'random' || sub === 'surprise') {
      const all = portal.SEEDS.map(s => ({ cat: s[0], name: s[1], url: s[2], why: s[3], source: 'seed' }));
      const pick = all[Math.floor(Math.random() * all.length)];
      portal.bumpPick(pick);
      const icon = portalCatIcon(pick.cat);
      return reply(`🌀 *One pick from the vault* ${icon}\n\n*${pick.name}*\n${pick.url}\n_${pick.why}_\n\n> _Send it again — it'll be someone else._`);
    }

    // ─── .portal stats ───
    if (sub === 'stats' || sub === 'market') {
      const s = portal.stats();
      const top = s.topDemanded.length
        ? s.topDemanded.map(([k, v]) => `  • \`${k}\` → momentum ${v.toFixed(1)}`).join('\n')
        : '  _nothing demanded yet — every view writes the market_';
      const supplyAge = s.supply ? Math.round((Date.now() - s.supply.fetchedAt) / 60000) : null;
      const supplyLine = s.supply
        ? `📥 Supply cache: ${supplyAge}m old — ${(s.supply.github || []).length} GitHub + ${(s.supply.hn || []).length} HN`
        : '📥 Supply cache: empty (fetches on first `.portal trending`)';
      return reply(
        `🌀 *PORTAL MARKET*\n\n` +
        `🏦 Vault: *${s.seeds}* vetted sites\n` +
        `🏛️ ${s.categories} realms\n` +
        `${supplyLine}\n\n` +
        `*Top demand:*\n${top}\n\n` +
        `> _Demand (your taps) × Supply (GitHub/HN live) = rotation._`
      );
    }

    // ─── .portal <category> ───
    if (sub) {
      const result = portal.categoryPicks(sub);
      if (!result) {
        const cats = portal.CATEGORIES.map(c => `${c.icon} \`${c.key}\``).join(' ');
        return reply(`🌀 Unknown realm *${sub}*.\n\nRealms: ${cats}\nOr \`.portal trending\` for live supply.`);
      }
      portal.bumpPick({ cat: result.cat.key });
      const L = [
        `🌀 *THE PORTAL — ${result.cat.title}* ${result.cat.icon}`,
        `_❝ ${result.cat.poem} ❞_`,
        '',
      ];
      result.picks.forEach((p, i) => L.push(fmtPick(p, i)));
      L.push('', '> _Send it again — the shuffle obeys demand._');
      return reply(L.join('\n'));
    }

    // ─── bare .portal — tappable if native, else rotating picks ───
    if (settingsStore.get('menu_native', false)) {
      try {
        await sock.sendMessage(jid, {
          text: `🌀 *THE PORTAL* — ${portal.SEEDS.length} vault sites + live supply\nWhere do you want to go, ${msg.pushName || 'traveler'}?`,
          buttonText: '🌀 Step Through',
          sections: [
            {
              title: '🏛️ Realms (evergreen vault)',
              rows: portal.CATEGORIES.map(c => ({
                title: `${c.icon} ${c.title}`,
                rowId: `.portal ${c.key}`,
                description: c.poem,
              })),
            },
            {
              title: '📡 Live Supply',
              rows: [
                { title: '🔥 Trending now', rowId: '.portal trending', description: 'GitHub Trending + Hacker News, live' },
                { title: '⭐ GitHub Trending', rowId: '.portal github', description: 'what devs star right now' },
                { title: '🎲 One random gem', rowId: '.portal random', description: 'a single perfect pick' },
              ],
            },
          ],
        }, { quoted: msg });
        return;
      } catch { /* fall to text */ }
    }

    const picks = portal.rotatingPicks(6);
    const L = ['🌀 *THE PORTAL*', '_the living atlas — never the same twice_', ''];
    picks.forEach((p, i) => L.push(fmtPick(p, i)));
    L.push('');
    L.push(`🏛️ Realms: ${portal.CATEGORIES.map(c => `${c.icon}\`${c.key}\``).join(' ')}`);
    L.push('📡 Live: `.portal trending` • 🎲 `.portal random` • 📊 `.portal stats`');
    L.push('> 🐺 Demand (you) × Supply (the world) = what she shows.');
    return reply(L.join('\n'));
  },
};
