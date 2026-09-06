/**
 * .remind — she remembers so you don't have to
 *
 *   .remind 45m check the oven          → in 45 minutes
 *   .remind 2h call mom                  → in 2 hours
 *   .remind 9pm sleep                   → at 9 tonight
 *   .remind tomorrow 8am gym            → tomorrow 8am
 *   .remind 3d pay rent                 → in 3 days
 *   .remind                              → list pending
 *   .remind cancel 2                     → cancel #2
 */
const tk = require('../utils/timekeeper');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

function ownerJidOf(msg, sock) {
  return config.ownerNumber + '@s.whatsapp.net';
}

module.exports = {
  name: 'remind',
  aliases: ['reminder', 'remindme'],
  description: '⏰ She remembers so you don\'t have to — .remind 45m text | 9pm text | tomorrow 8am text',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('⏰ _Her reminders belong to the one she stays for._');
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;

    // ─── list ───
    if (!args.length) {
      const list = tk.listReminders(ownerJidOf(msg, sock));
      if (!list.length) return reply('⏰ Nothing pending.\n\nGive her one: *.remind 45m check the oven*');
      const L = ['⏰ *Your reminders:*', ''];
      list.forEach((r, i) => {
        L.push(`${i + 1}. _"${r.text.slice(0, 50)}"_`);
        L.push(`   ⏳ ${tk.fmtWhen(r.dueTs)} • \`.remind cancel ${i + 1}\``);
      });
      return reply(L.join('\n'));
    }

    // ─── cancel ───
    if (args[0].toLowerCase() === 'cancel') {
      const r = tk.cancelReminder(ownerJidOf(msg, sock), args[1]);
      if (!r) return reply('⏰ Cancel what? *.remind* shows numbers → *.remind cancel 2*');
      return reply(`⏰ Let go of: _"${r.text.slice(0, 60)}"_`);
    }

    // ─── add ───
    const when = tk.parseWhen(args[0] + (args[1] && !tk.parseWhen(args[0]) ? ' ' + args[1] : ''));
    let whenLabel = args[0];
    let textStart = 1;

    if (!when) {
      // maybe "tomorrow 8am text" — two tokens of time
      const twoTok = tk.parseWhen(args[0] + ' ' + (args[1] || ''));
      if (twoTok) {
        textStart = 2;
        var when2 = twoTok;
      } else {
        return reply(
          '⏰ *When?* She understands:\n' +
          '• *.remind 45m <text>* — minutes (also 2h, 3d, 1w)\n' +
          '• *.remind 9pm <text>* — today at 9pm\n' +
          '• *.remind tomorrow 8am <text>*\n' +
          '• *.remind 25 dec <text>* — a date'
        );
      }
    }

    const finalWhen = when || when2;
    const text = args.slice(textStart).join(' ').trim();
    if (!text) return reply('⏰ Remind you of *what?* — *.remind 45m check the oven*');

    const entry = tk.addReminder({
      ownerJid: ownerJidOf(msg, sock),
      targetJid: config.ownerNumber + '@s.whatsapp.net',
      text,
      dueTs: finalWhen.ts,
    });

    return reply(
      `⏰ *Kept.*\n\n"${text}"\n\n⏳ _${tk.fmtWhen(finalWhen.ts)}_ — she'll DM you right on the moment.`
    );
  },
};
