/**
 * .habit — she counts your fire 🔥
 *
 *   .habit add water                 → start tracking
 *   .habit water                     → daily check-in
 *   .habit                           → dashboard with streaks
 *   .habit remove water
 */
const tk = require('../utils/timekeeper');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

function bar(streak) {
  const n = Math.min(streak, 10);
  return '🔥'.repeat(Math.max(1, n));
}

module.exports = {
  name: 'habit',
  aliases: ['habits', 'streak'],
  description: '🔥 Habit streaks — she counts your fire. .habit add water | .habit water (check-in)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('🔥 _She guards one flame at a time._');
    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
    const sub = (args[0] || '').toLowerCase();

    // ─── dashboard ───
    if (!args.length || sub === 'list') {
      const habits = tk.getHabits(ownerJid);
      const keys = Object.keys(habits);
      if (!keys.length) {
        return reply(
          '🔥 *No flames yet.*\n\n' +
          '*.habit add water* — start one\n' +
          '*.habit water* — daily check-in\n\n' +
          '_Consistency compounds. She keeps count._'
        );
      }
      const L = ['🔥 *YOUR STREAKS*', ''];
      keys.forEach(k => {
        const h = habits[k];
        const doneToday = h.lastCheck === tk.todayKey();
        const mark = doneToday ? '✅' : '⬜';
        L.push(`${mark} *${h.name}* — ${h.streak} day${h.streak !== 1 ? 's' : ''} ${bar(h.streak)}`);
        L.push(`   best: ${h.best} • \`.habit ${k}\` to check in`);
      });
      L.push('', '_Check in daily or the streak resets at midnight. She\'ll notice if you skip._');
      return reply(L.join('\n'));
    }

    // ─── add ───
    if (sub === 'add' || sub === 'new') {
      const name = args.slice(1).join(' ').trim();
      if (!name) return reply('🔥 Name it: *.habit add read 30 minutes*');
      const r = tk.addHabit(ownerJid, name);
      if (r.error) return reply(`🔥 *${name}* is already burning.`);
      return reply(`🔥 *${name}* — flame lit.\n\nFirst check-in: \`.habit ${r.key}\`\n_Milestones at 3, 7, 14, 30, 100. She celebrates every one._`);
    }

    // ─── remove ───
    if (sub === 'remove' || sub === 'rm') {
      const gone = tk.removeHabit(ownerJid, args[1]?.toLowerCase());
      if (!gone) return reply('🔥 Remove which? *.habit* lists them.');
      return reply(`🔥 Extinguished *${gone.name}*. It burned to ${gone.best} at best.`);
    }

    // ─── check-in ───
    const r = tk.checkHabit(ownerJid, sub);
    if (r.error === 'not found') {
      const habits = tk.getHabits(ownerJid);
      const close = Object.keys(habits).find(k => k.includes(sub) || sub.includes(k));
      if (close) {
        const r2 = tk.checkHabit(ownerJid, close);
        return finishCheck(r2, habits[close]);
      }
      return reply(`🔥 No habit called *${sub}*. *.habit add ${sub}* to light it.`);
    }
    if (r.error === 'already today') {
      return reply(`🔥 *${r.habit.name}* already checked today — ${r.habit.streak} days strong. Rest.`);
    }
    return finishCheck(r, null);

    function finishCheck(r2, h2) {
      if (r2.error) return reply(`🔥 ${r2.error}`);
      const h = r2.habit;
      let msg2 = `🔥 *${h.name}* — day ${h.streak}! ${bar(h.streak)}`;
      if (r2.milestone) {
        msg2 += `\n\n🏆 *${r2.milestone}-DAY MILESTONE.* She's proud of you.`;
      }
      if (h.streak === h.best && h.streak > 1) {
        msg2 += `\n\n📈 _New personal best._`;
      }
      msg2 += `\n\n> _${h.streak >= 7 ? 'This is who you are now.' : 'Come back tomorrow — she\'s counting.'}_`;
      return reply(msg2);
    }
  },
};
