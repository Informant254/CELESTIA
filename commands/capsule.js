/**
 * .capsule — messages to the future
 *
 *   .capsule 30d remember this day            → to yourself
 *   .capsule to @user 7d <message>            → to someone else (reply/tag)
 *   .capsule                                  → list
 *
 * All targeting via jidResolver — LID groups resolved to real phone jids.
 * Zero digits ever displayed: mentions render real names in WhatsApp.
 */
const tk = require('../utils/timekeeper');
const { resolvePhoneJid, phoneJidFromInput } = require('../utils/jidResolver');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

const OWNER = () => config.ownerNumber + '@s.whatsapp.net';

module.exports = {
  name: 'capsule',
  aliases: ['timecapsule', 'futureme'],
  description: '🕰️ Time capsules — send a message to the future. To yourself, or to anyone.',
  execute: async (sock, msg, args, commands, reply) => {
    if (!isOwner(msg)) return reply('🕰️ _Capsules are sealed by the one she stays for._');
    const sub = (args[0] || '').toLowerCase();

    // ─── list ───
    if (!args.length) {
      const list = tk.listCapsules(OWNER());
      if (!list.length) {
        return reply(
          '🕰️ *Your capsules:* none sealed yet.\n\n' +
          '*.capsule 30d <message>* — to future you\n' +
          '*.capsule to @user 7d <message>* — to their future'
        );
      }
      const L = ['🕰️ *Sealed capsules awaiting their moment:*', ''];
      list.forEach((c, i) => {
        const self = c.targetJid === OWNER();
        L.push(`${i + 1}. ${self ? '💭' : '✉️'} ${self ? 'to *you*' : 'to *someone*'} — _"${c.text.slice(0, 40)}..."_`);
        L.push(`   ⏳ opens ${tk.fmtWhen(c.dueTs)}`);
      });
      return reply(L.join('\n'));
    }

    // ─── capsule to <user> <when> <message> ───
    if (sub === 'to') {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      let rawTarget = null;
      let whenStr = '';
      let textStart = 2;

      // from mention
      const mentioned = ctx?.mentionedJid?.[0];
      if (mentioned) rawTarget = mentioned;
      // from reply
      if (!rawTarget && ctx?.participant) rawTarget = ctx.participant;

      // from raw number arg
      if (!rawTarget && args[1]) {
        const asJid = phoneJidFromInput(args[1]);
        if (asJid) {
          rawTarget = asJid;
          whenStr = args[2] || '';
          textStart = 3;
        } else {
          whenStr = args[1];
        }
      } else if (rawTarget && !whenStr) {
        whenStr = args[1] || '';
      }

      if (!rawTarget) {
        return reply('🕰️ Who receives it? Reply to their message, tag them, or:\n*.capsule to 7d <message>* (replying to them)');
      }

      // resolve LID → real phone jid
      const { jid: targetJid, resolved } = await resolvePhoneJid(sock, msg, rawTarget);
      if (!targetJid) {
        return reply('🕰️ Who receives it? Reply to their message or tag them.');
      }

      const when = tk.parseWhen(whenStr);
      if (!when) return reply('🕰️ When does it open? *.capsule to @user 7d <message>* (m/h/d/w, time, or date)');

      const text = args.slice(textStart).join(' ').trim();
      if (!text) return reply('🕰️ The capsule is empty. *.capsule to @user 7d I hope you\'re doing amazing*');

      const selfCap = targetJid === OWNER() || targetJid === (msg.key.remoteJidAlt || msg.key.remoteJid);
      tk.addReminder({
        ownerJid: OWNER(),
        targetJid,
        text,
        dueTs: when.ts,
        kind: 'capsule',
        meta: { fromName: msg.pushName || 'Someone who cares', resolvedLid: !resolved && targetJid.endsWith('@lid') },
      });

      // mention renders their real name — zero digits displayed
      const label = selfCap ? '*yourself*' : 'them';
      await sock.sendMessage(msg.key.remoteJid, {
        text:
          `🕰️ *Sealed.*\n\n` +
          `✉️ to: ${selfCap ? label : `@${targetJid.split('@')[0]}`}\n` +
          `⏳ opens: _${tk.fmtWhen(when.ts)}_\n\n` +
          `"${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"\n\n` +
          (when.ts - Date.now() > 86400000 * 365 ? '_A long journey. She\'ll guard it._' : '_She\'ll deliver it at the exact moment._') +
          (selfCap ? '' : `\n_(they'll know it came from someone who cares — you)_`),
        mentions: selfCap ? [] : [targetJid],
      }, { quoted: msg }).catch(() => reply(`🕰️ *Sealed.* Opens ${tk.fmtWhen(when.ts)}.`));
      return;
    }

    // ─── capsule <when> <message> — to self ───
    let whenStr = args[0];
    let textStart = 1;
    if (!tk.parseWhen(whenStr) && args[1]) {
      const two = tk.parseWhen(args[0] + ' ' + args[1]);
      if (two) { whenStr = args[0] + ' ' + args[1]; textStart = 2; }
    }
    const when = tk.parseWhen(whenStr);
    if (!when) {
      return reply(
        '🕰️ *When does it open?*\n\n' +
        '• *.capsule 30d <message>* — days (also 6h, 1w)\n' +
        '• *.capsule 1 jan 2027 <message>*\n' +
        '• *.capsule to @user 7d <message>* — to someone else'
      );
    }
    const text = args.slice(textStart).join(' ').trim();
    if (!text) return reply('🕰️ Write something to your future self:\n*.capsule 30d I hope the project shipped*');

    tk.addReminder({
      ownerJid: OWNER(),
      targetJid: OWNER(),
      text,
      dueTs: when.ts,
      kind: 'capsule',
    });

    const days = Math.round((when.ts - Date.now()) / 86400000);
    return reply(
      `🕰️ *Sealed.*\n\n"${text.slice(0, 120)}"\n\n⏳ opens _${tk.fmtWhen(when.ts)}_` +
      `${days >= 365 ? `\n\n_That's ${Math.round(days / 365)} year${Math.round(days / 365) > 1 ? 's' : ''} of patience. She doesn't lose things._` : ''}`
    );
  },
};
