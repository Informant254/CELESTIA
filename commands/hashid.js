const fortress = require('../utils/cyberFortress');

module.exports = {
  name: 'hashid',
  aliases: ['identifyhash'],
  description: '⚔️ Identify what algorithm produced a hash (length + charset fingerprinting)',
  execute: async (sock, msg, args, commands, reply) => {
    const target = args[0] ||
      (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '').trim();

    if (!target) {
      return reply('⚔️ Usage: *.hashid <hash>* or reply to a message containing only the hash');
    }

    const r = fortress.identifyHash(target);
    return reply([
      '⚔️ *HASH IDENTIFIER*',
      '',
      `Input: \`${r.input.slice(0, 40)}${r.input.length > 40 ? '...' : ''}\``,
      `Length: ${r.length} | Charset: ${r.charset}`,
      '',
      `*Candidates:*\n${r.candidates.length ? r.candidates.map(c => `• ${c}`).join('\n') : '• none — unusual format'}`,
      '',
      `Verdict: ${r.verdict}`,
      '',
      '> 🐺 Next step: throw it at a GPU. Or better — don\'t store it unhashed next time.',
    ].join('\n'));
  },
};
