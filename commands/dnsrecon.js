const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'dnsrecon',
  aliases: ['dns', 'dnslookup'],
  description: '⚔️ DNS recon — A, AAAA, MX, NS, TXT records (DNS over HTTPS)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply('⚔️ Usage: *.dnsrecon <domain>*\nExample: *.dnsrecon github.com*');
    }
    const domain = args[0].replace(/^https?:\/\//, '').split('/')[0];

    try {
      const rec = await fortress.dnsRecon(domain);
      const types = Object.keys(rec);
      if (!types.length) {
        return reply(`⚔️ No records resolved for *${domain}* — NXDOMAIN or DNSSEC-blocked.`);
      }

      const lines = [`⚔️ *DNS RECON — ${domain}*`, ''];
      for (const t of ['A', 'AAAA', 'MX', 'NS', 'TXT']) {
        if (!rec[t]) continue;
        lines.push(`*${t}* (${rec[t].length})`);
        rec[t].slice(0, 5).forEach(v => lines.push(`  • ${v.slice(0, 90)}`));
        lines.push('');
      }
      lines.push('> 🐺 MX reveals mail posture, TXT reveals SPF/DKIM/DMARC/verification tokens.');
      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ DNS recon failed: ${e.message}`);
    }
  },
};
