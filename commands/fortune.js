/**
 * .fortune — a small spark, never the same minute twice
 */
const mystic = require('../utils/mystic');

module.exports = {
  name: 'fortune',
  aliases: ['cookie', 'omen'],
  description: '🔮 A fortune for the moment — poetic, ever-changing',
  async execute(sock, msg, args, commands, reply) {
    return reply(mystic.fortune(msg.key.id));
  },
};
