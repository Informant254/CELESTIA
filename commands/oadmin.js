const { isOwner } = require('../utils/isOwner');
const { isBotAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'oadmin',
  aliases: ['mh', 'oio', 'rrh'],
  description: 'Promote yourself to admin (Owner only)',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
      return;
    }

    if (!isOwner(msg)) {
      return;
    }

    const senderJid = msg.key.participant || msg.key.remoteJid;

    let botIsAdmin = false;
    let youAreAdmin = false;
    try {
      const metadata = await sock.groupMetadata(jid);
      botIsAdmin = isBotAdmin(sock, metadata);
      const me = metadata.participants.find(p => p.id.split('@')[0].split(':')[0] === sock.user.id.split('@')[0].split(':')[0]);
      youAreAdmin = !!me?.admin;
    } catch {}

    if (!botIsAdmin) {
      return sock.sendMessage(jid, {
        text:
          `❌ *Can't crown you — I'm not admin here.*\n\n` +
          `WhatsApp servers only let an *admin session* promote people. I can't promote you (or myself) without being admin — no command can bypass this, it's enforced server-side.\n\n` +
          `*How to fix (pick one):*\n` +
          `1️⃣ You are admin → Group info → my contact → *Make group admin*, then run *.oadmin* again\n` +
          `2️⃣ Ask any current admin to promote me\n` +
          `3️⃣ Group owner promotes me from phone\n\n` +
          `Current status: Bot admin: ${botIsAdmin ? '✅' : '❌'} | You admin: ${youAreAdmin ? '✅' : '❌'}`,
      }, { quoted: msg });
    }

    try {
      await sock.groupParticipantsUpdate(jid, [senderJid], 'promote');

      await sock.sendMessage(
        jid,
        { text: '👑 *Crowned successfully!*' },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[OADMIN ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `😔 *Couldn't crown you.* Reason: ${err.message}\n\nThis usually means WhatsApp rejected the promote (bot lost admin, or you left the group).` },
        { quoted: msg }
      );
    }
  },
};
