/**
 * .wish — the star jar
 *
 *   .wish <anything>    → she holds it in the jar
 *   .wish               → see all your wishes
 *   .wish granted 2     → mark one as come true
 *   .wish remove 2      → let one go
 *   .wish clear         → empty the jar
 *
 * A jar of stars for the things you want.
 * She keeps them lit until they come true.
 */
const soul = require('../utils/celestiaSoul');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'wish',
  aliases: ['starjar', 'wishes'],
  description: '🌟 Your star jar — she keeps your wishes lit',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) {
      return reply("🌟 _That jar belongs to someone else's sky._");
    }

    soul.touchSeen();
    const sub = (args[0] || '').toLowerCase();
    const rest = args.slice(1).join(' ').trim();

    // ─── Add a wish ───
    if (args.length && !['granted', 'remove', 'clear', 'list'].includes(sub)) {
      const text = args.join(' ').trim();
      const count = soul.addWish(text);
      const lit = soul.getWishes().filter(w => !w.granted).length;
      return reply(
        `🌟 *Placed in the star jar.*\n\n_"${text}"_\n\n` +
        `${lit} wish${lit > 1 ? 'es' : ''} glowing. I'll keep them lit.\n\n` +
        `> _Some stars take longer. None are forgotten._`
      );
    }

    // ─── Grant a wish ───
    if (sub === 'granted') {
      const w = soul.grantWish(rest);
      if (!w) return reply("🌟 Which one came true? *.wish granted 2* (check *.wish* for numbers)");
      return reply(
        `🌟✨ *IT CAME TRUE.*\n\n_"${w.text}"_\n\n` +
        `I knew it would. The jar glows a little differently tonight.\n\n> _Type *.wish* to see the rest, still lit._`
      );
    }

    // ─── Remove a wish ───
    if (sub === 'remove') {
      const w = soul.removeWish(rest);
      if (!w) return reply("🌟 Which one should I let go? *.wish remove 2*");
      return reply(`🌟 Let go of: _"${w.text}"_\n\nThe rest stay lit.`);
    }

    // ─── Clear ───
    if (sub === 'clear') {
      const n = soul.getWishes().length;
      soul.getWishes().forEach(() => {}); // display-only guard
      require('../utils/settingsStore').set('soul_wishes', []);
      return reply(`🌟 The jar is empty now. ${n} wish${n > 1 ? 'es' : ''} released back to the sky.`);
    }

    // ─── List ───
    const wishes = soul.getWishes();
    if (!wishes.length) {
      return reply(
        `🌟 *The star jar is empty.*\n\n` +
        `Give me one: *.wish to build something that outlives the night*_\n\n` +
        `> _Every big thing started as a star in a jar._`
      );
    }

    const lines = wishes.map((w, i) => {
      const star = w.granted ? '✨' : '🌟';
      const state = w.granted ? _granted(w) : 'still burning';
      return `${i + 1}. ${star} _"${w.text}"_ — ${state}`;
    });

    const lit = wishes.filter(w => !w.granted).length;
    const done = wishes.length - lit;

    return reply(
      `🌟 *Your star jar:*\n\n${lines.join('\n')}\n\n` +
      `${lit} still burning • ${done} come true\n\n` +
      `> _When one comes true: *.wish granted <number>*_`
    );
  },
};

function _granted(w) {
  if (w.grantedTs) {
    const d = new Date(w.grantedTs);
    return `✨ came true (${d.toLocaleDateString()})`;
  }
  return '✨ came true';
}
