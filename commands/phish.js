const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'phish',
  aliases: ['urlcheck', 'checkurl', 'scamcheck'],
  description: '⚔️ Phishing URL analysis — 11 heuristic checks, instant local verdict',
  execute: async (sock, msg, args, commands, reply) => {
    let target = args.join(' ').trim();
    if (!target) {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      target = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
      const urlMatch = target.match(/https?:\/\/[^\s]+/);
      target = urlMatch ? urlMatch[0] : '';
    }

    if (!target) {
      return reply(
        '⚔️ *Phish Scanner*\n\n' +
        'Usage: *.phish <url>* or reply to any message with *.phish*\n\n' +
        'Checks: IP hosts • punycode homoglyphs • brand spoofing • risky TLDs (.zip .tk .xyz)\n' +
        'hyphen-stuffing • credential keywords • shorteners • @ tricks • deep subdomains'
      );
    }

    const r = fortress.analyzeUrl(target);
    if (r.error) return reply(`⚔️ ${r.error}`);

    const riskBar = '█'.repeat(Math.round(r.riskScore / 12)) + '░'.repeat(Math.max(0, 8 - Math.round(r.riskScore / 12)));

    const lines = [
      '⚔️ *PHISH SCANNER — URL ANALYSIS*',
      '',
      `Target: \`${r.host}\``,
      `Real domain: *${r.apex}*`,
      '',
      `Risk: [${riskBar}] *${r.riskScore}/100*`,
      '',
      `*VERDICT:* ${r.verdict}`,
      '',
      '*Signals:*',
    ];

    r.findings.slice(0, 10).forEach(f => lines.push(f));
    lines.push('');
    lines.push('> 🐺 Heuristics catch the lazy 90%. A clean verdict is not proof of safety — verify senders separately.');
    return reply(lines.join('\n'));
  },
};
