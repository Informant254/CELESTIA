const settingsStore = require('../utils/settingsStore');
const config = require('../config/config');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'prefix',
  description: 'Change the bot command prefix. Usage: .prefix <new prefix>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ Only the owner can change the prefix.' }, { quoted: msg });
    }

    const currentPrefix = settingsStore.get('prefix', config.prefix);
    const newPrefix = args[0];

    if (!newPrefix) {
      return sock.sendMessage(jid, {
        text: `⚡ *Current prefix:* \`${currentPrefix}\`\n\nUsage: ${currentPrefix}prefix <new prefix>\nExample: ${currentPrefix}prefix !`
      }, { quoted: msg });
    }

    if (newPrefix.length > 3) {
      return sock.sendMessage(jid, { text: '❌ Keep the prefix short — 1 to 3 characters works best.' }, { quoted: msg });
    }

    settingsStore.set('prefix', newPrefix);

    await sock.sendMessage(jid, {
      text: `✅ Prefix changed from \`${currentPrefix}\` to \`${newPrefix}\`.\n\nFrom now on, use commands like: ${newPrefix}menu`
    }, { quoted: msg });
  }
};
