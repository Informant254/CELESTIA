/**
 * .level / .pet / .daily / .quests / .loot — the game surface
 */
const game = require('../utils/gameCore');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

function card() {
  const c = game.getCard();
  const bar = '█'.repeat(Math.round(c.pct / 10)) + '░'.repeat(10 - Math.round(c.pct / 10));
  return [
    '🎮 *YOUR LEGEND*',
    '',
    `👑 Level *${c.level}* — *${c.title.toUpperCase()}*`,
    `XP: ${c.xpIntoLevel}/${c.xpForNext} [${bar}] ${c.pct}%`,
    level_line(c),
    `⭐ Stars: *${c.stars}*`,
    `🔥 Streak: *${c.streak.count} days*`,
    `🧾 Commands run: ${c.totalCommands}`,
    `🏆 Achievements: ${c.achievements.length}/${game.ACHIEVEMENTS.length}`,
    '',
    `🐺 Your wolf: *${c.pet.name}*`,
    `   ${c.pet.art}`,
    `   _${c.pet.desc}_`,
    '',
    '_`.daily` • `.quests` • `.loot` • `.casino` • `.menu`_',
  ].join('\n');
}

function level_line(c) {
  return c.level >= 30 ? '_MAX — the throne is yours._' : `_next: ${c.nextTitle}_`;
}

module.exports = {
  name: 'level',
  aliases: ['rank', 'xp', 'legend'],
  description: '🎮 Your legend — level, stars, streak, wolf, achievements',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🎮 _The legend belongs to one._');
    return reply(card());
  },
};
