module.exports = {
  name: 'kick',
  aliases: ['k', 'remove'],
  description: 'Kick one or more group members (admin only).',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    if (!jid.endsWith('@g.us')) {
      return await sock.sendMessage(
        jid,
        { text: '*This command only works in groups.*' },
        { quoted: msg }
      );
    }

    const metadata = await sock.groupMetadata(jid);
    const senderJid = msg.key.participant || msg.key.remoteJid;

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

    const DEV_NUMBERS = [
      '254754574642@s.whatsapp.net',
      '254718701810@s.whatsapp.net',
      '254100616449@s.whatsapp.net',
      '254715941789@s.whatsapp.net',
    ];

    const msgType = Object.keys(msg.message || {})[0];
    const contextInfo = msg.message?.[msgType]?.contextInfo || {};

    let targets = [];

    if (contextInfo.participant) {
      targets.push(contextInfo.participant);
    }

    if (Array.isArray(contextInfo.mentionedJid)) {
      targets.push(...contextInfo.mentionedJid);
    }

    targets = [...new Set(targets)];

    if (!targets.length) {
      return await sock.sendMessage(
        jid,
        { text: '*Who should I remove !?, give me a target*' },
        { quoted: msg }
      );
    }

    const { getBotIdentifiers } = require('../utils/isAdmin');
    const botIds = getBotIdentifiers(sock);

    for (const target of targets) {
      const parts = target.split('@')[0];

      if (DEV_NUMBERS.includes(target)) {
        await sock.sendMessage(
          jid,
          {
            text: "*It's my Developer CELESTIA ! 👑, I can't remove him*"
          },
          { quoted: msg }
        );
        continue;
      }

      if (botIds.has(target)) {
        await sock.sendMessage(
          jid,
          { text: '*I cannot remove Myself 😡*' },
          { quoted: msg }
        );
        continue;
      }

      await sock.sendMessage(
        jid,
        {
          text: `@${parts}, Goodbye dickhead🤧`,
          mentions: [target],
        },
        { quoted: msg }
      );

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        'remove'
      );
    }
  },
};
