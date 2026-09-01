const { isOwner } = require('../utils/isOwner');

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
        { text: "😔 *Couldn't crown you.*" },
        { quoted: msg }
      );
    }
  },
};
