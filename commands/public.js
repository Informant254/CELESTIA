const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'public',
    description: 'Set bot to public mode.',
    async execute(sock, msg) {
        if (!isOwner(msg)) return;

        settingsStore.set('mode', 'public');
        await sock.sendMessage(msg.key.remoteJid, {
            text: '🌐 *Work Mode updated:* Bot is now set to *public*'
        });
    },
};
