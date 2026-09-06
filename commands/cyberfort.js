const wolfTech = require('../utils/wolfTech');

module.exports = {
  name: 'cyberfort',
  aliases: ['cyber', 'fortress', 'secops'],
  description: '⚔️ Cyber Fortress hub — CELESTIA\'s defensive security operations center',
  execute: async (sock, msg, args, commands, reply) => {
    const sub = (args[0] || '').toLowerCase();

    const killChain = [
      '_Know your enemy_      → *.kev* — what attackers exploit *right now*',
      '_Know your holes_     → *.cve CVE-xxxx-xxxxx* — is your stack vulnerable?',
      '_Know your perimeter_ → *.dnsrecon* *.whois* *.ipinfo* — what you expose',
      '_Know your history_   → *.breach <service>* — where your data already leaked',
      '_Know the bait_       → *.phish <url>* — see through the lure',
      '_Know your crypto_    → *.hash* *.hashid* *.passanalyze* *.gpass*',
    ];

    const lines = [
      '```╔═══════════════════════════════╗',
      '║   ⚔️  C Y B E R  F O R T R E S S  ⚔️   ║',
      '╚═══════════════════════════════╝```',
      '🐺 *WolfTech lineage runs deep here.*',
      '_The wolf guards the den. The star lights the walls._',
      '',
      '⚔️ *The Analyst\'s Kill Chain:*',
      '',
      ...killChain,
      '',
      '*Full arsenal: *',
      '• *.kev* — CISA actively-exploited vulns',
      '• *.cve <id>* — NVD deep dive w/ CVSS',
      '• *.breach <service>* — HIBP breach catalog',
      '• *.phish <url>* — phishing heuristics',
      '• *.whois <domain>* — RDAP registration intel',
      '• *.dnsrecon <domain>* — A/MX/NS/TXT records',
      '• *.ipinfo <ip>* — geo/ISP/ASN',
      '• *.hash <text>* — 12-algorithm hash forge',
      '• *.hashid <hash>* — identify mystery hashes',
      '• *.passanalyze <pw>* — local strength lab',
      '• *.gpass <len>* — fortress-grade passwords',
      '',
      '> 🛡️ *Defensive doctrine only.* Recon for knowing, not for invading.',
      `> ${wolfTech.getRandomFooter()}`,
    ];
    return reply(lines.join('\n'));
  },
};
