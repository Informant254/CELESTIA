const { isOwner } = require('../utils/isOwner');

module.exports = {
    name: 'restart',
    aliases: ['reboot', 'boot'],
    description: 'Restarts the bot process (owner only).',
    async execute(sock, msg) {
        const jid = msg.key.remoteJid;
        if (!isOwner(msg)) {
            return sock.sendMessage(jid, { text: '*❌ Are you my owner ?.*' }, { quoted: msg });
        }

        await sock.sendMessage(jid, { text: '*🔄 System reboot initiated, Restarting bot....*' }, { quoted: msg });
        setTimeout(() => process.exit(0), 1000);
    },
};
