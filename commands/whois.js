const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'whois',
  aliases: ['domaininfo', 'rdap'],
  description: '⚔️ RDAP whois — registrar, dates, nameservers, DNSSEC (modern replacement for whois)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply('⚔️ Usage: *.whois <domain>*\nExample: *.whois google.com*');
    }
    const domain = args[0].replace(/^https?:\/\//, '').split('/')[0].toLowerCase();

    try {
      const d = await fortress.whois(domain);
      const age = d.creation ? Math.floor((Date.now() - new Date(d.creation)) / 86400000 / 365) : null;

      const lines = [
        `⚔️ *RDAP WHOIS — ${d.domain || domain}*`,
        '',
        `Registrar: ${d.registrar || 'n/a'}`,
        d.creation ? `Created: ${d.creation.slice(0, 10)}${age !== null ? ` _(${age}y old)_` : ''}` : '',
        d.updated ? `Updated: ${d.updated.slice(0, 10)}` : '',
        d.expiry ? `Expires: ${d.expiry.slice(0, 10)}` : '',
        '',
        `DNSSEC: ${d.dnssec}`,
        '',
      ].filter(Boolean);

      if (d.status?.length) {
        lines.push(`Status: ${d.status.slice(0, 4).join(', ')}`);
        lines.push('');
      }
      if (d.nameservers?.length) {
        lines.push('*Nameservers:*');
        d.nameservers.slice(0, 5).forEach(ns => lines.push(`• ${ns}`));
        lines.push('');
      }

      // Phish-relevant heuristic
      if (age !== null && age < 1) {
        lines.push('🚨 *Domain under 1 year old — fresh registrations are a major phishing indicator*');
        lines.push('');
      }

      lines.push('> 🐺 Data: RDAP (the modern whois). New + cheap + lookalike = treat hostile.');
      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ ${e.message}`);
    }
  },
};
