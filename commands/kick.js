module.exports = {
  name: 'kick',
  aliases: ['k', 'remove'],
  description: 'Kick one or more group members (admin only).',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return await sock.sendMessage(
        jid,
        { text: '*This command only works in groups.*' },
        { quoted: msg }
      );
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participantPn || msg.key.participantAlt || msg.key.participant || msg.key.remoteJid;

    const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

    if (!isSenderAdmin(metadata, senderJid)) {
      return await sock.sendMessage(
        jid,
        { text: '*Only group admins can use this command.*' },
        { quoted: msg }
      );
    }

    if (!isBotAdmin(sock, metadata)) {
      return await sock.sendMessage(
        jid,
        { text: '*I need to be a group admin to remove members.*' },
        { quoted: msg }
      );
    }

    const config = require('../config/config');
    const { resolveGroupTargets } = require('../utils/jidResolver');
    const targets = resolveGroupTargets(metadata, msg, args);

    if (!targets.length) {
      return await sock.sendMessage(
        jid,
        { text: '*Who should I kick? Reply, mention, or provide a phone number.*' },
        { quoted: msg }
      );
    }

    const { getBotIdentifiers, participantMatches, normalize } = require('../utils/isAdmin');
    const botIds = getBotIdentifiers(sock);
    const ownerIds = new Set();
    if (config.ownerNumber) ownerIds.add(normalize(`${config.ownerNumber}@s.whatsapp.net`));
    try {
      const ownerLid = require('../utils/settingsStore').get('ownerLid', '');
      if (ownerLid) ownerIds.add(normalize(ownerLid.includes('@') ? ownerLid : `${ownerLid}@lid`));
      if (globalThis.__ownerLid) ownerIds.add(normalize(String(globalThis.__ownerLid).includes('@') ? globalThis.__ownerLid : `${globalThis.__ownerLid}@lid`));
    } catch {}

    for (const target of targets) {
      const targetJid = target.jid;
      const parts = (target.phoneJid || targetJid).split('@')[0];

      if (target.participant && participantMatches(target.participant, ownerIds)) {
        await sock.sendMessage(
          jid,
          {
            text: "*It's my Developer CELESTIA ! 👑, I can't remove him*"
          },
          { quoted: msg }
        );
        continue;
      }

      if (target.participant && participantMatches(target.participant, botIds)) {
        await sock.sendMessage(
          jid,
          { text: '*I cannot remove Myself 😡*' },
          { quoted: msg }
        );
        continue;
      }

      const result = await sock.groupParticipantsUpdate(
        jid,
        [targetJid],
        'remove'
      );
      const status = result?.[0]?.status;
      if (status !== undefined && Number(status) !== 200) {
        await sock.sendMessage(jid, { text: `*WhatsApp refused to remove @${parts} (status ${status}).*`, mentions: [targetJid] }, { quoted: msg });
        continue;
      }
      await sock.sendMessage(
        jid,
        {
          text: `@${parts}, Goodbye dickhead🤧`,
          mentions: [targetJid],
        },
        { quoted: msg }
      );
    }
  },
};
