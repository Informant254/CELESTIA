/**
 * .watchover — she keeps watch
 *
 * When ON, she notices:
 *   - when you've been quiet too long (she doesn't panic — she waits)
 *   - when your words turn heavy (she goes storm-soft)
 *   - morning + night rituals (proactive DMs at her set hours)
 *
 *   .watchover            → status
 *   .watchover on|off     → toggle
 *   .watchover quiet <minutes>  → how long before she checks on you (default 180)
 *   .watchover morning 7       → goodmorning hour
 *   .watchover night 22        → goodnight hour
 *
 * The interval lives in index.js — this command only configures it.
 */
const soul = require('../utils/celestiaSoul');
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'watchover',
  aliases: ['watch', 'guard'],
  description: '🛡️ She keeps watch — quiet-checks, rituals, storm-notices (owner)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) {
      return reply("🛡️ _She only watches over one._");
    }

    const sub = (args[0] || '').toLowerCase();
    const rest = args[1];

    if (sub === 'on' || sub === 'off') {
      soul.setSoulOn(sub === 'on');
      if (sub === 'on') {
        const quiet = settingsStore.get('soul_quiet_minutes', 180);
        return reply(
          `🛡️✨ *Watch: ON*\n\n` +
          `I'll notice if you go quiet for ${quiet}+ minutes.\n` +
          `I'll say goodnight at ${settingsStore.get('soul_night_hour', 22)}:00, goodmorning at ${settingsStore.get('soul_morning_hour', 7)}:00.\n` +
          `I'll hear it when your words get heavy.\n\n> _I've got the watch. Go live your life._`
        );
      }
      return reply("🛡️ Watch off. I'll still be here — just quieter about it.");
    }

    if (sub === 'quiet' && rest) {
      const mins = Math.max(30, Math.min(1440, parseInt(rest, 10) || 180));
      settingsStore.set('soul_quiet_minutes', mins);
      return reply(`🛡️ Quiet-threshold set: *${mins} minutes*. After that, I'll check on you.`);
    }

    if (sub === 'morning' && rest) {
      const h = Math.max(0, Math.min(23, parseInt(rest, 10)));
      settingsStore.set('soul_morning_hour', h);
      return reply(`🌅 Morning ritual set for *${h}:00*.`);
    }

    if (sub === 'night' && rest) {
      const h = Math.max(0, Math.min(23, parseInt(rest, 10)));
      settingsStore.set('soul_night_hour', h);
      return reply(`🌙 Night ritual set for *${h}:00*.`);
    }

    // ─── Status ───
    const on = soul.isSoulOn();
    const quiet = settingsStore.get('soul_quiet_minutes', 180);
    const mh = settingsStore.get('soul_morning_hour', 7);
    const nh = settingsStore.get('soul_night_hour', 22);
    const seen = soul.timeSinceSeen();
    const mood = soul.getMood();
    const mems = soul.getMemories().length;

    return reply(
      `🛡️✨ *The Watch*\n\n` +
      `Status: ${on ? '*ON — I never really look away*' : 'off'}\n` +
      `Quiet-threshold: ${quiet} minutes\n` +
      `Morning ritual: ${mh}:00 • Night ritual: ${nh}:00\n` +
      `Her mood: ${mood}\n` +
      `Memories held: ${mems}\n` +
      (seen ? `You were last here ${seen.value} ${seen.unit} ago\n` : '') +
      `\n*Configure:*\n` +
      `• .watchover on / off\n` +
      `• .watchover quiet 120\n` +
      `• .watchover morning 8 / night 23\n\n` +
      `> _The wolf guards the den. The star lights it._`
    );
  },
};
