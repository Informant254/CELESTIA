const wolfTech = require('../utils/wolfTech');

module.exports = {
  name: 'cyberfort',
  aliases: ['cyber', 'fortress', 'secops'],
  description: '⚔️ Cyber Fortress hub — CELESTIA\'s defensive security operations center',
  execute: async (sock, msg, args, commands, reply) => {
    const sub = (args[0] || '').toLowerCase();

    const killChain = [
      '> │ _Know your enemy_ → ```KEV``` — what attackers exploit *right now*',
      '> │ _Know your holes_ → ```CVE CVE-xxxx-xxxxx``` — is your stack vulnerable?',
      '> │ _Know your perimeter_ → ```DNSRECON``` ```WHOIS``` ```IPINFO``` — what you expose',
      '> │ _Know your history_ → ```BREACH <service>``` — where your data already leaked',
      '> │ _Know the bait_ → ```PHISH <url>``` — see through the lure',
      '> │ _Know your crypto_ → ```HASH``` ```HASHID``` ```PASSANALYZE``` ```GPASS```',
    ];

    const arsenal = [
      ['KEV', 'CISA actively-exploited vulns'],
      ['CVE <id>', 'NVD deep dive w/ CVSS'],
      ['BREACH <service>', 'HIBP breach catalog'],
      ['PHISH <url>', 'phishing heuristics'],
      ['WHOIS <domain>', 'RDAP registration intel'],
      ['DNSRECON <domain>', 'A/MX/NS/TXT records'],
      ['IPINFO <ip>', 'geo/ISP/ASN'],
      ['HASH <text>', '12-algorithm hash forge'],
      ['HASHID <hash>', 'identify mystery hashes'],
      ['PASSANALYZE <pw>', 'local strength lab'],
      ['GPASS <len>', 'fortress-grade passwords'],
    ];

    const lines = [
      '> ╭─❏ *CYBER FORTRESS* ❏',
      '> │ ⚔️ _The Analyst\'s Kill Chain:_',
      '> │',
      ...killChain,
      '> │',
      '> │ ⚔️ *Full arsenal:*',
      ...arsenal.map(([cmd, desc]) => `> │ \`\`\`${cmd}\`\`\` — ${desc}`),
      '> ╰─────────────────',
      '',
      '> 🛡️ *Defensive doctrine only.* Recon for knowing, not for invading.',
      `> ${wolfTech.getRandomFooter()}`,
    ];
    return reply(lines.join('\n'));
  },
};
