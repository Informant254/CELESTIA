const { isOwner, ownerForms } = require('../utils/isOwner');
const { addSudo, listSudo } = require('../utils/isSudo');
const { resolvePhoneJid } = require('../utils/jidResolver');

module.exports = {
  name: 'addsudo',
  aliases: ['sudo'],
  description: 'Grants a user sudo access (owner only). Reply to their message, tag them, or pass a number.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const digitsOf = (v) => String(v || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    const valid = (d) => /^\d{7,16}$/.test(d);

    const quoted = ctx.participant || null;
    const mentioned = ctx.mentionedJid?.[0] || null;
    const rawTarget = quoted || mentioned || null;

    // LID → real phone number first (sibling fields, then the group roster).
    // The LID digits themselves are still kept below: later messages may
    // arrive LID-addressed and isSudo must match those too.
    let numbers = [];
    let primary = null;
    if (rawTarget) {
      try {
        const resolved = await resolvePhoneJid(sock, msg, rawTarget);
        if (resolved?.resolved && String(resolved.jid).endsWith('@s.whatsapp.net')) {
          primary = digitsOf(resolved.jid);
          if (valid(primary)) numbers.push(primary);
        }
      } catch { /* fall through to the raw forms */ }
    }

    // LID-era addressing: the quoted sender is usually ctx.participant
    // (...@lid) with participantPn often absent. A reply's PN + LID forms
    // describe the SAME person, so store both; tags / typed numbers are a
    // single identity each. Mirrors delsudo's resolution order.
    const replyForms = [ctx.participantPn, ctx.participantAlt, ctx.participant]
      .map(digitsOf).filter(valid);
    let fallbackNumbers = replyForms.length
      ? [...new Set(replyForms)]
      : [digitsOf(ctx.mentionedJid?.[0]), digitsOf(args[0])].filter(valid).slice(0, 1);
    numbers = [...new Set([...numbers, ...fallbackNumbers])];

    // Enrich a reply/tag through group metadata so both the PN and LID are
    // stored even when the quoted context only carries one of them.
    if (jid.endsWith('@g.us') && numbers.length) {
      try {
        const metadata = await sock.groupMetadata(jid);
        const { participantMatches, normalize } = require('../utils/isAdmin');
        const ids = new Set([
          ctx.participantPn,
          ctx.participantAlt,
          ctx.participant,
          ctx.mentionedJid?.[0],
        ].filter(Boolean).map(normalize));
        const participant = (metadata.participants || []).find((p) => participantMatches(p, ids));
        if (participant) {
          numbers = [...new Set([...numbers, participant.id, participant.jid, participant.lid, participant.phoneNumber]
            .map(digitsOf).filter(valid))];
        }
      } catch { /* existing forms remain usable */ }
    }

    if (!numbers.length) {
      return sock.sendMessage(jid, {
        text: '❌ *Reply to the user\'s message, tag them, or provide their number directly.*\n\nUsage: *.addsudo @user* — or — *.addsudo 2547XXXXXXXX*',
      }, { quoted: msg });
    }

    // The owner needs no sudo grant (matched on the PN, a learned LID, or
    // whichever form the reply carried).
    const ownerIds = ownerForms();
    if (ownerIds.size && numbers.every((n) => ownerIds.has(n))) {
      return sock.sendMessage(jid, { text: '❌ You are already the owner! No need to add yourself as sudo.' }, { quoted: msg });
    }

    // Store every known form (PN + LID): future messages may arrive in
    // either addressing, and isSudo matches the sender's first available.
    const before = new Set(listSudo());
    const already = numbers.some((n) => before.has(n));
    for (const n of numbers) addSudo(n);

    const shown = primary || numbers[0];
    const text = already
      ? `ℹ️ *+${shown} is already a sudo user.* Known ID forms re-linked.`
      : `✅ *+${shown} granted sudo access.* Known ID forms linked: ${numbers.length}.`;
    await sock.sendMessage(jid, { text }, { quoted: msg });
  },
};
