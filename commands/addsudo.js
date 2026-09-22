const { isOwner } = require('../utils/isOwner');
const { addSudo } = require('../utils/isSudo');

module.exports = {
  name: 'addsudo',
  aliases: ['sudo'],
  description: 'Grants a user sudo access (owner only).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const digitsOf = (v) => String(v || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const valid = (d) => /^\d{7,16}$/.test(d);

    // LID-era addressing: the quoted sender is usually ctx.participant
    // (...@lid) with participantPn often absent. A reply's PN + LID forms
    // describe the SAME person, so store both; tags / typed numbers are a
    // single identity each. Mirrors delsudo's resolution order.
    const replyForms = [ctx.participantPn, ctx.participantAlt, ctx.participant]
      .map(digitsOf).filter(valid);
    const numbers = replyForms.length
      ? [...new Set(replyForms)]
      : [digitsOf(ctx.mentionedJid?.[0]), digitsOf(args[0])].filter(valid).slice(0, 1);

    if (!numbers.length) {
      return sock.sendMessage(jid, {
        text: `❌ *Reply to the user's message, tag them, or provide their number directly.*\n\nUsage: *.addsudo @user* — or — *.addsudo ${require('../config/config').ownerNumber}*`,
      }, { quoted: msg });
    }

    // Store every known form (PN + LID): future messages may arrive in
    // either addressing, and isSudo matches the sender's first available.
    for (const n of numbers) addSudo(n);

    await sock.sendMessage(jid, { text: `✅ *${numbers.map((n) => `+${n}`).join(', ')} granted sudo access.*` }, { quoted: msg });
  },
};
