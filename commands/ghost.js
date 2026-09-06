/**
 * .ghost — the Ghost Whisper 👻
 *
 * She delivers your message for you — HER number appears as the sender,
 * you are nowhere in it. To the recipient it's a message from the bot,
 * with no trace of who asked her.
 *
 *   .ghost <number> <message>              → she delivers it
 *   .ghost @user <message> (reply/tag)     → same, hands-free
 *   .ghost inbox                           → replies routed back to you privately
 *
 * Replies to her delivery land in her inbox; she forwards them to
 * you with full context — a two-way anonymous channel.
 *
 * Honesty note (she displays it too): WhatsApp shows HER number as
 * sender. Truly numberless sending doesn't exist on WhatsApp — anyone
 * claiming otherwise is selling spyware. What she offers: you stay
 * invisible; she takes the visibility.
 */
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');
const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'ghost',
  aliases: ['whisper', 'anon', 'anonymous'],
  description: '👻 Ghost Whisper — she delivers your message; you stay invisible',
  async execute(sock, msg, args, commands, reply) {
    if (!isOwner(msg)) return reply('👻 _Only the one she stays for can send ghosts._');
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
    const ownerJid = config.ownerNumber + '@s.whatsapp.net';
    const sub = (args[0] || '').toLowerCase();

    // ─── inbox: show ghost conversations ───
    if (sub === 'inbox' || sub === 'replies') {
      const settingsStore = require('../utils/settingsStore');
      const threads = settingsStore.get('ghost_threads', {});
      const keys = Object.keys(threads);
      if (!keys.length) return reply('👻 No ghost conversations yet.\n\n.ghost <number> <message>');
      const L = ['👻 *GHOST INBOX — your anonymous threads:*', ''];
      keys.forEach(num => {
        const t = threads[num];
        const last = t[t.length - 1];
        L.push(`• *${num}* — ${t.length} message${t.length > 1 ? 's' : ''}, last ${timeAgo(last.ts)}`);
        L.push(`  _last: "${(last.text || '').slice(0, 40)}"_`);
      });
      L.push('', '_Replies to her deliveries auto-forward to you here in DM._');
      return reply(L.join('\n'));
    }

    // ─── resolve target ───
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    let targetJid = null;
    let textStart = 0;

    const mentioned = ctx?.mentionedJid?.[0];
    if (mentioned) {
      targetJid = mentioned;
      textStart = 1;
    } else if (ctx?.participant) {
      targetJid = ctx.participantPn || ctx.participant;
      textStart = 1;
    } else if (args.length && /^\+?\d{8,15}$/.test(args[0].replace(/\D/g, ''))) {
      targetJid = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
      textStart = 1;
    } else if (args.length >= 2 && args[0].startsWith('@')) {
      // "@user message" typed without actual mention formatting
      return reply('👻 Tag a real @mention, reply to their message, or use their number:\n`.ghost 2547XXXXXXXX hey, this is a ghost...`');
    }

    if (!targetJid) {
      return reply(
        '👻 *THE GHOST WHISPER*\n\n' +
        'She delivers it. Her number shows. You don\'t.\n\n' +
        '• `.ghost 2547XXXXXXXX <message>`\n' +
        '• reply to their message with `.ghost <message>`\n' +
        '• `.ghost @user <message>`\n' +
        '• `.ghost inbox` — replies forward back to you\n\n' +
        '_Replies come to her; she forwards them to you. Two-way, invisible._'
      );
    }

    // ─── resolve LID if needed ───
    if (String(targetJid).endsWith('@lid')) {
      try {
        const resolver = require('../utils/jidResolver');
        const r = await resolver.resolvePhoneJid(sock, msg, targetJid);
        if (r.resolved) targetJid = r.jid;
      } catch { /* keep lid — group-local delivery */ }
    }

    const text = args.slice(textStart).join(' ').trim();
    if (!text) return reply('👻 Say something: `.ghost 2547XXXXXXXX the stars say hi`');

    // ─── the delivery ───
    const envelope =
      `👻 *A ghost whispers:*\n\n` +
      `"${text}"\n\n` +
      `_Reply to this message and your words will reach them._`;

    try {
      await sock.sendMessage(targetJid, { text: envelope });
    } catch (e) {
      return reply(`👻 Couldn't deliver: ${e.message}`);
    }

    // ─── remember the thread for reply-forwarding ───
    const settingsStore = require('../utils/settingsStore');
    const threads = settingsStore.get('ghost_threads', {});
    const tNum = String(targetJid).split('@')[0];
    threads[tNum] = threads[tNum] || [];
    threads[tNum].push({ text, ts: Date.now(), dir: 'out' });
    settingsStore.set('ghost_threads', threads);

    return reply(
      `👻 *Delivered.*\n\nTo: @${tNum}\n"${text.slice(0, 80)}"\n\n_Her number took the visibility; yours took the shadows. Replies forward to you._`,
    );
  },
};

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
