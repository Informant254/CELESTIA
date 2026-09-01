const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'mode',
    description: 'Toggle bot work mode between public and private.',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        if (args[0] === 'public' || args[0] === 'private') {
            settingsStore.set('mode', args[0]);
            return await sock.sendMessage(msg.key.remoteJid, {
                text: `🔒 *Work Mode updated:* Bot is now set to *${args[0]}*`
            });
        }

        const currentMode = settingsStore.get('mode', 'public');
        await sock.sendMessage(msg.key.remoteJid, {
            text: `🔒 *Current Mode:* \`${currentMode.toUpperCase()}\`\n\n💡 Use \`.mode public\` or \`.mode private\` to change it.`
        });
    },
};
