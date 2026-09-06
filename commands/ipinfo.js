const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'ipinfo',
  aliases: ['geoip', 'ip'],
  description: '⚔️ IP intelligence — geo, ISP, ASN (ipwho.is)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply('⚔️ Usage: *.ipinfo <ip or domain>*\nExample: *.ipinfo 1.1.1.1*');
    }
    const target = args[0].trim();

    try {
      const d = await fortress.ipInfo(target);
      const lines = [
        `⚔️ *IP INTEL — ${d.ip}* ${d.flag || ''}`,
        '',
        `Type: ${d.type || 'n/a'}`,
        `Geo: ${[d.city, d.region, d.country].filter(Boolean).join(', ') || 'n/a'}`,
        `TZ: ${d.timezone || 'n/a'}`,
        '',
        `ISP: ${d.isp || 'n/a'}`,
        `Org: ${d.org || 'n/a'}`,
        `ASN: ${d.asn || 'n/a'}`,
        '',
        '> 🐺 Defensive recon only — know your infrastructure, know your exposure.',
      ];
      return reply(lines.join('\n'));
    } catch (e) {
      return reply(`⚔️ Lookup failed: ${e.message}`);
    }
  },
};
