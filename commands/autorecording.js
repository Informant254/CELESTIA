const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'autorecording',
    description: 'Toggle automatic recording status for incoming messages.',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        if (args[0] === 'on') {
            settingsStore.set('autorecording', true);
            return await sock.sendMessage(msg.key.remoteJid, { text: '🎙️ *Auto-Recording:* ENABLED [🟢]' });
        } else if (args[0] === 'off') {
            settingsStore.set('autorecording', false);
            return await sock.sendMessage(msg.key.remoteJid, { text: '🎙️ *Auto-Recording:* DISABLED [🔴]' });
        }

        const status = settingsStore.get('autorecording', false) ? 'ENABLED [🟢]' : 'DISABLED [🔴]';
        await sock.sendMessage(msg.key.remoteJid, {
            text: `🎙️ *Auto-Recording Status:* ${status}\n\n💡 Use \`.autorecording on\` or \`.autorecording off\` to change it.`
        });
    },
};
