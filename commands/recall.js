/**
 * .recall — search her memories
 *
 *   .recall <query>   → matches across everything you've told her
 *   .recall           → recent memories
 *
 * Scoring: exact word hits > prefix hits > fuzzy inclusion.
 * Works on memories + wishes text.
 */
const soul = require('../utils/celestiaSoul');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

function scoreEntry(entry, terms) {
  const text = String(entry.text || '').toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (text.includes(t)) score += t.length >= 4 ? 10 : 4;
    // word-start bonus
    if (new RegExp(`\\b${t}`).test(text)) score += 5;
  }
  // recency bonus
  const ageDays = (Date.now() - (entry.ts || 0)) / 86400000;
  score += Math.max(0, 5 - ageDays * 0.1);
  return score;
}

module.exports = {
  name: 'recall',
  aliases: ['remember?', 'memory'],
  description: '🧠 Search her memories — .recall <query>',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('🧠 _Her memories belong to one._');

    const mems = soul.getMemories();
    const wishes = soul.getWishes().map(w => ({ text: `[wish] ${w.text}${w.granted ? ' (came true ✨)' : ''}`, ts: w.ts }));

    if (!mems.length && !wishes.length) {
      return reply('🧠 She holds nothing yet.\n\nGive her something: `.celestia remember my birthday is March 4th`');
    }

    if (!args.length) {
      const recent = [...mems, ...wishes].sort((a, b) => b.ts - a.ts).slice(0, 10);
      const L = ['🧠 *What she holds (recent):*', ''];
      recent.forEach((m, i) => L.push(`${i + 1}. _${m.text.slice(0, 60)}_`));
      L.push('', '_Search: `.recall birthday`_');
      return reply(L.join('\n'));
    }

    const query = args.join(' ').toLowerCase();
    const terms = query.split(/\s+/).filter(t => t.length > 2);

    const pool = [...mems, ...wishes].map(e => ({ e, score: scoreEntry(e, terms) }));
    const hits = pool.filter(p => p.score > 3).sort((a, b) => b.score - a.score).slice(0, 8);

    if (!hits.length) {
      return reply(`🧠 Nothing she holds matches *"${args.join(' ')}"*.\n\nShe holds ${mems.length} memories, ${wishes.length} wishes. Use ".celestia remember <thing>" to add.`);
    }

    const L = [`🧠 *She remembers — "${args.join(' ')}":*`, ''];
    hits.forEach((h, i) => {
      const ago = h.e.ts ? timeAgo(h.e.ts) : '';
      L.push(`${i + 1}. _${h.e.text.slice(0, 80)}_`);
      if (ago) L.push(`   ${ago}`);
    });
    return reply(L.join('\n'));
  },
};

function timeAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)}mo ago`;
}
