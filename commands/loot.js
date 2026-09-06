/**
 * .loot — open a box (costs 20⭐) or view collection
 */
const game = require('../utils/gameCore');
const { isOwner } = require('../utils/isOwner');

const RARITY_ICON = { common: '🔹', rare: '🔷', epic: '💜', legendary: '🟠', mythic: '🔴' };

module.exports = {
  name: 'loot',
  aliases: ['crate', 'box'],
  description: '🎲 Loot boxes — 20⭐ each. Mythic odds: 2%',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🎲 _The vault spins for one._');
    const sub = (args[0] || '').toLowerCase();
    const s = game.load();

    // collection view
    if (sub === 'collection' || sub === 'items') {
      const owned = Object.entries(s.loot).filter(([, n]) => n > 0);
      const L = ['🎲 *YOUR COLLECTION*', ''];
      if (!owned.length) L.push('empty — `.loot` to open your first box');
      for (const [id, n] of owned) {
        const it = game.LOOT_TABLE.find(l => l.id === id);
        if (it) L.push(`${RARITY_ICON[it.rarity]} ${it.icon} *${it.name}* ×${n} _(${it.rarity})_`);
      }
      return reply(L.join('\n') + `\n\n_⭐ balance: ${s.stars}_`);
    }

    // open a box — costs 20 stars
    if (s.stars < 20) {
      return reply(`🎲 A box costs *20⭐* — you have ${s.stars}.\n\nEarn: \`.daily\` • quests \`.quests\` • commands. Every command pays.`);
    }
    s.stars -= 20;
    game.save(s);
    const item = game.openLoot();

    const isJackpot = item.rarity === 'mythic';
    return reply(
      (isJackpot ? '🔴🔴🔴 *MYTHIC PULL!!!* 🔴🔴🔴\n\n' : '') +
      `🎲 *THE BOX OPENS...*\n\n` +
      `${item.icon}\n*${item.name.toUpperCase()}*\n` +
      `${RARITY_ICON[item.rarity]} _${item.rarity}_\n\n` +
      `+${item.stars}⭐ back into your purse\n\n` +
      `_Balance: ${s.stars + item.stars}⭐ • \`.loot collection\` to admire what you own_`
    );
  },
};
