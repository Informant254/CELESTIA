const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'antilinkall',
    description: 'Toggle group-wide link deletion across all groups.',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        if (args[0] === 'on') {
            settingsStore.set('antilinkall', true);
            return await sock.sendMessage(msg.key.remoteJid, { text: '🔗 *Antilink (All Groups):* ENABLED [🟢]' });
        } else if (args[0] === 'off') {
            settingsStore.set('antilinkall', false);
            return await sock.sendMessage(msg.key.remoteJid, { text: '🔗 *Antilink (All Groups):* DISABLED [🔴]' });
        }

        const status = settingsStore.get('antilinkall', false) ? 'ENABLED [🟢]' : 'DISABLED [🔴]';
        await sock.sendMessage(msg.key.remoteJid, {
            text: `🔗 *Antilink (All Groups) Status:* ${status}\n\n💡 Use \`.antilinkall on\` or \`.antilinkall off\` to change it.`
        });
    },
};
