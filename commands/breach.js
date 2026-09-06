const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'breach',
  aliases: ['breachcheck', 'databreach'],
  description: '⚔️ Breach catalog search (HIBP) — which breaches hit a site/service & what data leaked',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply(
        '⚔️ *Breach Intel (HIBP catalog)*\n\n' +
        'Usage: *.breach <company or domain>*\nExamples: *.breach linkedin* • *.breach adobe.com*\n\n' +
        'Returns: breach dates, pwned counts, and the exact data classes exposed (emails, passwords, card numbers...).\n\n' +
        'ℹ️ Email-specific checking requires an HIBP API key — this searches the free public catalog.'
      );
    }

    try {
      const hits = await fortress.breachCatalog(args.join(' '));
      if (!hits.length) {
        return reply('⚔️ No breaches found in the catalog for that query — either genuinely clean or too obscure to be cataloged.');
      }

      const lines = [`⚔️ *BREACH INTEL — ${hits.length} hit${hits.length > 1 ? 's' : ''}*`, ''];
      for (const b of hits) {
        lines.push(
          `💀 *${b.name}*${b.domain ? ` (${b.domain})` : ''}` +
          `\n📅 ${b.breachDate || '?'} • ${b.pwnCount.toLocaleString()} accounts` +
          `\n📦 Leaked: ${b.dataClasses.join(', ')}` +
          (b.sensitive ? `\n🚫 Flagged sensitive` : '') +
          (b.verified ? `\n✅ Verified` : `\n❓ Unverified`) + '\n'
        );
      }
      lines.push('> 🐺 If a service you use is listed — rotate that password NOW, check reuse everywhere.');
      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ Breach lookup failed: ${e.message}`);
    }
  },
};
