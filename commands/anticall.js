const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'anticall',
    description: 'Toggle automatically rejecting incoming calls.',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        if (args[0] === 'on') {
            settingsStore.set('anticall', true);
            return await sock.sendMessage(msg.key.remoteJid, { text: '📵 *Anticall:* ENABLED [🟢]' });
        } else if (args[0] === 'off') {
            settingsStore.set('anticall', false);
            return await sock.sendMessage(msg.key.remoteJid, { text: '📵 *Anticall:* DISABLED [🔴]' });
        }

        const status = settingsStore.get('anticall', false) ? 'ENABLED [🟢]' : 'DISABLED [🔴]';
        await sock.sendMessage(msg.key.remoteJid, {
            text: `📵 *Anticall Status:* ${status}\n\n💡 Use \`.anticall on\` or \`.anticall off\` to change it.`
        });
    },
};
