const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

module.exports = {
  name: 'approve',
  aliases: ['approveall', 'approve-all'],
  description: 'Approves all pending join requests (admin only).',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;

    if (!isSenderAdmin(metadata, senderJid)) {
      return sock.sendMessage(jid, { text: '❌ *Only group admins can use this command.*' }, { quoted: msg });
    }
    if (!isBotAdmin(sock, metadata)) {
      return sock.sendMessage(jid, { text: '❌ *I need admin privileges.*' }, { quoted: msg });
    }

    try {
      const pending = await sock.groupRequestParticipantsList(jid);

      if (!pending.length) {
        return sock.sendMessage(jid, { text: 'ℹ️ *No pending join requests.*' }, { quoted: msg });
      }

      const jids = pending.map(p => p.jid);
      await sock.groupRequestParticipantsUpdate(jid, jids, 'approve');
      await sock.sendMessage(jid, { text: `✅ *Approved ${jids.length} join request(s).*` }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: `❌ *Failed to approve requests: ${e.message}*` }, { quoted: msg });
    }
  },
};
