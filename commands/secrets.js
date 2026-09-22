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
    const total = secrets.eggNames().length;
    let found = [];
    try {
      found = require('../utils/gameCore').load().eggsFound || [];
    } catch { /* progress never breaks hints */ }
    const trails = [];
    for (let i = 0; i < 3; i++) {
      const hint = secrets.randomHint([...found, ...trails.map((t) => t.trigger)]);
      if (!hint) break;
      trails.push(hint);
    }
    return reply(
      `🎃 *SHE HAS SECRETS (${found.length}/${total} found)*\n\n` +
      `Hidden commands exist. She will not list them.\nShe will not confirm guesses.\nShe WILL reward the finder.\n\n` +
      (trails.length
        ? `_Fresh trails, because she likes you:_\n` +
          trails.map((t, i) => `${i + 1}. ${t.hint}`).join('\n') +
          `\n\n_Rumors also surface on their own, ~1 in 100 commands._\n\n`
        : `👑 *Every secret found. The hunt is complete.*\n\n`) +
      `> _The best secrets are the ones you type by accident._ 🐺`
    );
  },
};
