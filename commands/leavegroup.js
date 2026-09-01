const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'leavegroup',
  aliases: ['leavegc', 'leavebylink'],
  description: 'Makes the bot leave a group using its invite link (Owner only).',

  async execute(sock, msg, args) {
    if (!isOwner(msg)) {
      return sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ This command is owner only.' },
        { quoted: msg }
      );
    }

    if (!args[0]) {
      return sock.sendMessage(
        msg.key.remoteJid,
        {
          text:
            'Usage:\n.leavegroup https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX'
        },
        { quoted: msg }
      );
    }

    const match = args[0].match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);

    if (!match) {
      return sock.sendMessage(
        msg.key.remoteJid,
        { text: '❌ Invalid WhatsApp group invite link.' },
        { quoted: msg }
      );
    }

    const inviteCode = match[1];

    try {
      const info = await sock.groupGetInviteInfo(inviteCode);
      const groupJid = info.id;

      const groups = await sock.groupFetchAllParticipating();

      if (!groups[groupJid]) {
        return sock.sendMessage(
          msg.key.remoteJid,
          { text: 'ℹ️ I am not a member of that group.' },
          { quoted: msg }
        );
      }

      await sock.sendMessage(groupJid, {
        text:
          '👋 I have been instructed by my owner to leave this group.\n\nThank you for having me!'
      });

      await sock.groupLeave(groupJid);

      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text: `✅ Successfully left *${info.subject}*.`
        },
        { quoted: msg }
      );
    } catch (err) {
      await sock.sendMessage(
        msg.key.remoteJid,
        {
          text: `❌ Failed to leave the group.\n\n${err.message}`
        },
        { quoted: msg }
      );
    }
  }
};
