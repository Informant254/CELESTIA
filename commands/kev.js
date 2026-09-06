const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'kev',
  description: '⚔️ CISA Known Exploited Vulnerabilities — the list attackers are already using',
  execute: async (sock, msg, args, commands, reply) => {
    try {
      const kev = await fortress.kevList();
      const lines = [
        '⚔️ *CISA KEV — KNOWN EXPLOITED VULNERABILITIES*',
        '',
        `Total cataloged: *${kev.count}*`,
        `Last updated: ${kev.dateReleased || 'n/a'}`,
        '',
        '*Latest additions:*',
      ];

      for (const v of kev.recent.slice(0, 8)) {
        const note = (v.shortDescription || v.vulnerabilityName || '').slice(0, 70);
        lines.push(
          `💀 *${v.cveID}* — ${v.vendorName}/${v.productName}` +
          `\n   _${note}${note.length >= 70 ? '...' : ''}_`
        );
      }

      lines.push('');
      lines.push('> 🐺 If you run any of these products — patch *today*, not this quarter.');
      lines.push('> _Full catalog: cisa.gov/known-exploited-vulnerabilities-catalog_');

      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ KEV fetch failed: ${e.message}`);
    }
  },
};
