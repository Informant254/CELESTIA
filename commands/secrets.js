/**
 * .secrets — the hint that secrets exist (never the answers)
 */
const { isOwner } = require('../utils/isOwner');
const secrets = require('../utils/secrets');

module.exports = {
  name: 'secrets',
  aliases: ['eastereggs', 'mystery'],
  description: '🎃 She has secrets. She won\'t tell you what they are.',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('🎃 _Her secrets belong to one._');
    return reply(
      `🎃 *SHE HAS SECRETS*\n\n` +
      `Hidden commands exist. She will not list them.\nShe will not confirm guesses.\nShe WILL reward the finder.\n\n` +
      `_Hints, because she likes you:_\n` +
      `• One is about food that's grid-shaped\n` +
      `• One is the ultimate answer\n` +
      `• One involves praising the wrong animal\n` +
      `• One activates her true form\n\n` +
      `+_4% of your commands trigger... other things. Watch for them._\n\n` +
      `> _The best secrets are the ones you type by accident._ 🐺`
    );
  },
};
