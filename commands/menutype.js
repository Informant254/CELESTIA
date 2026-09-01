const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'menutype',
    description: 'Set the menu display style. Usage: .menutype list|button',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        const choice = args[0]?.toLowerCase();

        if (choice === 'list' || choice === 'button') {
            settingsStore.set('menutype', choice);
            return await sock.sendMessage(msg.key.remoteJid, { text: `📋 *Menu Type:* set to *${choice}*` });
        }

        await sock.sendMessage(msg.key.remoteJid, {
            text: `📋 *Current Menu Type:* ${settingsStore.get('menutype', 'list')}\n\n💡 Use \`.menutype list\` or \`.menutype button\` to change it.`
        });
    },
};
