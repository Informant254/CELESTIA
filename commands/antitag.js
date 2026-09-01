const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
    name: 'antitag',
    description: 'Toggle deleting mass-tag spam messages from non-admins.',
    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;

        if (!isOwner(msg) && !isSudo(msg)) {
            return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
        }

        if (args[0] === 'on') {
            settingsStore.set('antitag', true);
            return await sock.sendMessage(jid, { text: '🏷️ *Antitag:* ENABLED [🟢]' }, { quoted: msg });
        } else if (args[0] === 'off') {
            settingsStore.set('antitag', false);
            return await sock.sendMessage(jid, { text: '🏷️ *Antitag:* DISABLED [🔴]' }, { quoted: msg });
        }

        const status = settingsStore.get('antitag', false) ? 'ENABLED [🟢]' : 'DISABLED [🔴]';
        await sock.sendMessage(jid, {
            text: `🏷️ *Antitag Status:* ${status}\n\n💡 Use \`.antitag on\` or \`.antitag off\` to change it.`
        }, { quoted: msg });
    },
};
