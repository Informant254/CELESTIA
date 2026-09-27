/**
 * .tone — tag a contact so autochat never mixes up girls and boys.
 *
 *   .tone girl | .tone boy | .tone off   (inside their DM, or reply/tag them)
 *   .tone girl @user   .tone boy 2547...   (from anywhere)
 *   .tone list
 */
const { isOwner } = require('../utils/isOwner');
const tone = require('../autochat/tone');

module.exports = {
  name: 'tone',
  aliases: ['voice-tone', 'gender'],
  description: '👫 Tag a contact girl/boy so autochat uses the right energy',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });
    if (!isOwner(msg)) return reply('👫 _She only takes that order from one voice._');

    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'list') {
      const entries = tone.list();
      if (!entries.length) return reply('👫 No tones tagged yet.\n\n`.tone girl` / `.tone boy` inside their DM — or `.tone girl @user`.');
      const girls = entries.filter(([, t]) => t === 'girl').map(([d]) => `♀ +${d}`);
      const boys = entries.filter(([, t]) => t === 'boy').map(([d]) => `♂ +${d}`);
      return reply(`👫 *TAGGED TONES*\n\n${[...girls, ...boys].join('\n')}`);
    }
    if (!['girl', 'boy', 'off'].includes(sub)) {
      return reply('👫 Usage:\n`.tone girl` / `.tone boy` / `.tone off`\n(send inside their DM, or reply to / tag them)');
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const target =
      tone.bare(ctx.participantPn || ctx.participantAlt || ctx.participant) ||
      tone.bare(ctx.mentionedJid?.[0]) ||
      tone.bare(args[1]) ||
      (!jid.endsWith('@g.us') ? tone.bare(msg.key.remoteJidAlt || jid) : '');
    if (!/^\d{7,16}$/.test(target)) {
      return reply('👫 I could not tell who — reply to their message, tag them, or add the number:\n`.tone girl @user`');
    }
    tone.set(target, sub === 'off' ? null : sub);
    if (sub === 'off') return reply(`👫 Tone cleared for +${target} — back to neutral.`);
    return reply(sub === 'girl'
      ? `♀ +${target} tagged — she'll bring soft charming energy, never mix her up.`
      : `♂ +${target} tagged — full bro banter, roasts included.`);
  },
};
