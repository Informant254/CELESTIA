/**
 * .expense — the honest ledger 💼
 *
 *   .expense lunch 450          → log an expense
 *   .expense                    → today + this week summary
 *   .expense week               → last 7 days breakdown by category guess
 *   .expense clear              → wipe
 */
const settingsStore = require('../utils/settingsStore');
const tk = require('../utils/timekeeper');
const { isOwner } = require('../utils/isOwner');

const KEY = 'expenses';

function load() { return settingsStore.get(KEY, []); }
function save(v) { settingsStore.set(KEY, v); }

function guessCategory(text) {
  const t = text.toLowerCase();
  if (/uber|taxi|bus|matatu|fuel|petrol|boda|transport/.test(t)) return 'Transport 🚗';
  if (/lunch|dinner|breakfast|food|eat|restaurant|cafe|coffee| snack/.test(t)) return 'Food 🍽️';
  if (/airtime|bundle|wifi|data|mpesa|sms|internet/.test(t)) return 'Connectivity 📶';
  if (/rent|house|deposit/.test(t)) return 'Housing 🏠';
  if (/med|pharmacy|hospital|doctor|clinic/.test(t)) return 'Health 💊';
  if (/movie|game|fun|out|club|date/.test(t)) return 'Fun 🎉';
  return 'Other 📦';
}

module.exports = {
  name: 'expense',
  aliases: ['expenses', 'spend'],
  description: '💼 Track expenses — .expense <what> <amount> • category auto-guessed',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('💼 _The ledger belongs to one._');
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'clear') {
      const n = load().length;
      save([]);
      return reply(`💼 Ledger cleared — ${n} entries released.`);
    }

    // ─── log: .expense lunch 450 ───
    if (args.length >= 2) {
      const amount = parseFloat(args[args.length - 1]);
      const what = args.slice(0, -1).join(' ').trim();
      if (isNaN(amount) || amount <= 0 || !what) {
        return reply('💼 *.expense lunch 450* — what + how much');
      }
      const entry = { what, amount, ts: Date.now(), cat: guessCategory(what) };
      const list = load();
      list.push(entry);
      save(list);
      const today = list.filter(e => new Date(e.ts).toDateString() === new Date().toDateString());
      const todayTotal = today.reduce((s, e) => s + e.amount, 0);
      return reply(`💼 Logged: *${what}* — ${amount.toLocaleString()}\n_${entry.cat}_\n\nToday so far: *${todayTotal.toLocaleString()}*`);
    }

    // ─── summary ───
    const list = load();
    if (!list.length) {
      return reply('💼 Ledger empty.\n\n*.expense lunch 450* — every entry auto-sorted.');
    }

    const today = list.filter(e => new Date(e.ts).toDateString() === new Date().toDateString());
    const weekAgo = Date.now() - 7 * 86400000;
    const week = list.filter(e => e.ts >= weekAgo);
    const sum = (arr) => arr.reduce((s, e) => s + e.amount, 0);

    // category breakdown this week
    const byCat = {};
    for (const e of week) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
    const catLines = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([c, v]) => `  ${c} — ${v.toLocaleString()}`).join('\n');

    const L = [
      '💼 *YOUR LEDGER*',
      '',
      `📅 Today: *${sum(today).toLocaleString()}* (${today.length} entries)`,
      `🗓️ Last 7 days: *${sum(week).toLocaleString()}* (${week.length} entries)`,
      '',
      '*By category (week):*',
      catLines || '  —',
      '',
      `_Avg/day: ${(sum(week) / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} • \`.expense clear\` to reset_`,
    ];
    return reply(L.join('\n'));
  },
};
