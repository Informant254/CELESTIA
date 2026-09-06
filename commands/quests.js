/**
 * .quests — daily quests; .loot — open boxes
 */
const game = require('../utils/gameCore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'quests',
  aliases: ['quest', 'dailies'],
  description: '🗺️ Daily quests — 3 fresh ones every midnight',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🗺️ _The questlog belongs to one._');
    const quests = game.rollQuests();
    const s = game.load();
    const L = ['🗺️ *TODAY\'S QUESTS*', ''];
    let done = 0;
    quests.forEach((q) => {
      const complete = s.quests.claimed.includes(q.id);
      if (complete) done++;
      L.push(`${complete ? '✅' : '⬜'} ${q.desc}`);
      L.push(`   _reward: ${q.reward}⭐ + 25 XP_`);
    });
    L.push('');
    if (done === quests.length) {
      L.push('🌟 *ALL COMPLETE. She\'s proud. Come back tomorrow.*');
    } else {
      L.push(`*${done}/${quests.length} done* — finish all: **+30⭐ +50XP bonus**`);
    }
    return reply(L.join('\n'));
  },
};
