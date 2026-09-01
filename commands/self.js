const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'self',
    description: 'Set bot to private mode.',
    async execute(sock, msg) {
        if (!isOwner(msg)) return;

        settingsStore.set('mode', 'private');
        await sock.sendMessage(msg.key.remoteJid, {
            text: '🔒 *Work Mode updated:* Bot is now set to *private*'
        });
    },
};
