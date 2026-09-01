const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'mygroups',
  aliases: ['groups', 'botgroups', 'glist'],
  description: 'List all groups the bot is in (owner only).',
  async execute(sock, msg) {
    console.log("[MYGROUPS] execute started");
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    if (!isOwner(msg)) {
      return await sock.sendMessage(
        jid,
        { text: '❌ *Only the bot owner can use this command.*' },
        { quoted: msg }
      );
    }

    try {
      const allGroups = await sock.groupFetchAllParticipating();
      const groupList = Object.values(allGroups);

      if (!groupList.length) {
        return await sock.sendMessage(
          jid,
          { text: '⚠️ *Bot is not in any groups.*' },
          { quoted: msg }
        );
      }

      let text = `📋 *My Groups (${groupList.length})*\n\n`;

      groupList.forEach((group, index) => {
        text += `*${index + 1}. ${group.subject || 'Unnamed Group'}*\n`;
        text += `👥 *Members:* ${group.participants?.length || 0}\n`;
        text += `🆔 *JID:* \`${group.id}\`\n\n`;
      });

      await sock.sendMessage(jid, { text: text.trim() }, { quoted: msg });
    } catch (err) {
      console.error('[MYGROUPS ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ *Error while accessing bot groups:*\n${err.message}` },
        { quoted: msg }
      );
    }
  },
};

