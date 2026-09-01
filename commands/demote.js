module.exports = {
  name: 'demote',
  aliases: ['d'],
  description: 'Demotes a mentioned admin back to a regular member (admin only).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      await sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
      return;
    }

    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const repliedTo = msg.message?.extendedTextMessage?.contextInfo?.participant;
    const targetJid = mentioned[0] || repliedTo;

    if (!targetJid) {
      await sock.sendMessage(
        jid,
        { text: '❌ *Who should I demote,mention or tag someone with the command.*' },
        { quoted: msg }
      );
      return;
    }

const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const { isBotAdmin: checkBotAdmin, isSenderAdmin: checkSenderAdmin } = require('../utils/isAdmin');

    const isSenderAdmin = checkSenderAdmin(metadata, senderJid);
    const isBotAdmin = checkBotAdmin(sock, metadata);

    if (!isSenderAdmin) {      await sock.sendMessage(jid, { text: '❌ *Command reserved for group admins.*' }, { quoted: msg });
      return;
    }
    if (!isBotAdmin) {
      await sock.sendMessage(
        jid,
        { text: '❌ *I need to be an admin, crown me.*' },
        { quoted: msg }
      );
      return;
    }

    await sock.groupParticipantsUpdate(jid, [targetJid], 'demote');
    await sock.sendMessage(
      jid,
      { text: `⬇️ *Demoted @${targetJid.split('@')[0]} to member.*`, mentions: [targetJid] },
      { quoted: msg }
    );
  },
};

