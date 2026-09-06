const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'passanalyze',
  aliases: ['pwstrength', 'passwordcheck'],
  description: '⚔️ Local password strength analysis — entropy, crack-time, weak patterns (never sent anywhere)',
  execute: async (sock, msg, args, commands, reply) => {
    if (!args.length) {
      return reply(
        '⚔️ *Password Lab*\n\n' +
        'Usage: *.passanalyze <password>*\n\n' +
        '🔒 Analysis is 100% local — the password never leaves this server, never logged, never stored.\n\n' +
        'You\'ll get: entropy bits • charset score • estimated offline GPU crack-time • weak-pattern flags'
      );
    }

    const pw = args.join(' ');
    const r = fortress.analyzePassword(pw);

    const lines = [
      '⚔️ *PASSWORD LAB — LOCAL ANALYSIS*',
      '',
      `Verdict: ${r.label}`,
      `Score: ${r.score}`,
      `Entropy: *${r.entropyBits} bits*`,
      `Est. crack time (offline GPU rig, fast hash): *${r.crackTime}*`,
      '',
    ];

    if (r.findings.length) {
      lines.push('*Findings:*');
      r.findings.slice(0, 8).forEach(f => lines.push(f));
    } else {
      lines.push('✅ No weak patterns detected.');
    }

    lines.push('');
    lines.push('🔒 _Processed locally. Nothing transmitted, nothing stored._');
    lines.push('> 🐺 Want a fortress password? *.gpass 24*');

    // Best practice: don't leave the password itself echoed in chat
    return reply(lines.join('\n'));
  },
};
