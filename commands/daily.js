/**
 * .daily + .quests + .loot — the habit loop commands
 */
const game = require('../utils/gameCore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'daily',
  aliases: ['claim', 'dailybonus'],
  description: '🎁 Daily gift — stars + a loot box key. Once every 24h',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🎁 _Gifts are for one._');
    const s = game.load();
    const today = new Date().toISOString().slice(0, 10);
    if (s.lastDaily === today) {
      return reply('🎁 Already claimed today.\n\n_The next gift unlocks at midnight. She counts the hours with you._');
    }
    const streak = game.touchStreak();
    const stars = 10 + streak.count * 2;
    s.lastDaily = today;
    game.save(s);
    game.grantXp(15, 'daily');
    // auto-open one loot box
    const item = game.openLoot();
    const rarityIcon = { common: '🔹', rare: '🔷', epic: '💜', legendary: '🟠', mythic: '🔴' }[item.rarity];
    return reply(
      `🎁 *DAILY GIFT CLAIMED*\n\n` +
      `+${stars} ⭐ (streak x${streak.count})\n` +
      `+15 XP\n\n` +
      `*And a loot box opened:*\n` +
      `${rarityIcon} *${item.name}* ${item.icon} _(${item.rarity})_ +${item.stars}⭐\n\n` +
      `_Come back tomorrow — the streak multiplies._`
    );
  },
};
