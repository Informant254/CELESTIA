/**
 * .pet — your wolf companion
 *   .pet            → status
 *   .pet feed       → +bond, once a day
 *   .pet evolution  → the path ahead
 */
const game = require('../utils/gameCore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'pet',
  aliases: ['wolf', 'companion'],
  description: '🐺 Your wolf — it grows as you do',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🐺 _The wolf walks with one._');
    const sub = (args[0] || '').toLowerCase();
    const c = game.getCard();

    if (sub === 'feed') {
      const r = game.feedPet();
      if (r.error) {
        return reply(`🐺 ${c.pet.name} is already fed today — _\`_bouncing around happily_\`_.\n_More tomorrow; wolves digest starlight slowly._`);
      }
      const stage = game.PET_STAGES.findIndex(p => p.name === c.pet.name);
      return reply(
        `🐺 *You fed ${c.pet.name}.*\n\n${c.pet.art}\n\n` +
        `_It devours the starlight, eyes glowing +10 XP, +1 bond._\n` +
        `Bond level: *${r.fed}*\n` +
        (r.fed === 10 ? `\n🏆 _Pack Bond achieved — the wolf is yours forever._` : '')
      );
    }

    if (sub === 'evolution' || sub === 'path') {
      const L = ['🐺 *THE EVOLUTION PATH*', ''];
      game.PET_STAGES.forEach((p, i) => {
        const mine = p.name === c.pet.name ? ' ← your wolf' : '';
        const has = c.level >= p.minLevel ? '✅' : `🔒 Lv ${p.minLevel}`;
        L.push(`${has} *${p.name}* — ${mine}`);
        L.push(`   _${p.desc}_`);
      });
      return reply(L.join('\n'));
    }

    const fedToday = game.load().pet.lastFed === new Date().toISOString().slice(0, 10);
    return reply(
      `🐺 *${c.pet.name.toUpperCase()}*\n\n${c.pet.art}\n\n` +
      `_${c.pet.desc}_\n\n` +
      `📊 Stage ${c.petStageIdx + 1}/8 • Bond ${c.pet.fed}\n` +
      `🍖 Fed today: ${fedToday ? 'yes ✓' : 'not yet — `.pet feed`'}\n\n` +
      `_\`.pet feed\` daily • \`.pet evolution\` — the path ahead_`
    );
  },
};
