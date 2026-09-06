/**
 * .tarot — the full 78-card deck
 *
 *   .tarot            → single card
 *   .tarot 3          → three-card pull (past / present / future)
 *   .tarot celtic     → 5-card cross (condensed Celtic)
 */
const mystic = require('../utils/mystic');

module.exports = {
  name: 'tarot',
  aliases: ['cards', 'pull'],
  description: '🔮 Full 78-card tarot — single, 3-card (past/present/future), or 5-card cross',
  async execute(sock, msg, args, commands, reply) {
    const sub = (args[0] || '').toLowerCase();
    const seed = `${msg.key.id}-${Date.now()}`;

    let positions;
    let cards;
    if (sub === 'celtic' || sub === 'cross' || sub === '5') {
      cards = mystic.drawTarot(5, seed);
      positions = ['the heart of it', 'what crosses you', 'the root below', 'what hangs above', 'where it leads'];
    } else if (sub === '3' || sub === 'three') {
      cards = mystic.drawTarot(3, seed);
      positions = ['the past', 'the present', 'what\'s coming'];
    } else if (/^\d+$/.test(sub) && +sub >= 1 && +sub <= 10) {
      cards = mystic.drawTarot(+sub, seed);
      positions = cards.map((_, i) => `card ${i + 1}`);
    } else {
      cards = mystic.drawTarot(1, seed);
      positions = ['the pull'];
    }

    const L = ['🔮 *THE CARDS SPEAK*', ''];
    cards.forEach((c, i) => {
      const rev = c.reversed ? ' *(reversed)*' : '';
      L.push(`*${positions[i].toUpperCase()}*`);
      L.push(`${c.name}${rev} — _${c.arcana}_`);
      L.push(`  ${c.meaning}`);
      L.push('');
    });
    L.push('> _Tarot doesn\'t predict; it reflects. You do the choosing._');
    return reply(L.join('\n'));
  },
};
