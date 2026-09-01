const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'autotyping',
    description: 'Toggle automatic typing status for incoming messages.',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        if (args[0] === 'on') {
            settingsStore.set('autotyping', true);
            return await sock.sendMessage(msg.key.remoteJid, { text: '💬 *Auto-Typing:* ENABLED [🟢]' });
        } else if (args[0] === 'off') {
            settingsStore.set('autotyping', false);
            return await sock.sendMessage(msg.key.remoteJid, { text: '💬 *Auto-Typing:* DISABLED [🔴]' });
        }

        const status = settingsStore.get('autotyping', false) ? 'ENABLED [🟢]' : 'DISABLED [🔴]';
        await sock.sendMessage(msg.key.remoteJid, {
            text: `💬 *Auto-Typing Status:* ${status}\n\n💡 Use \`.autotyping on\` or \`.autotyping off\` to change it.`
        });
    },
};
