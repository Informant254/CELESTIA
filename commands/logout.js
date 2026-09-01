const { isOwner } = require('../utils/isOwner');
const { isDev } = require('../utils/isDev');

module.exports = {
    name: 'logout',
    aliases: ['disconnect', 'logoff'],
    description: 'Logs the bot out of WhatsApp, requiring re-pairing (owner/developer only, destructive).',
    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;

        if (!isOwner(msg) && !isDev(msg)) {
            return sock.sendMessage(jid, {
                text: '❌ Only the bot owner can use this command.'
            }, { quoted: msg });
        }

        if (args[0]?.toLowerCase() !== 'ok') {
    return sock.sendMessage(jid, {
        text: '⚠️ This will log the bot out of WhatsApp completely. You will need to re-pair.\n\nType *.logout ok* to proceed.'
    }, { quoted: msg });
}

        await sock.sendMessage(jid, {
            text: '👋 Logging out...'
        }, { quoted: msg });

        await sock.logout();
    },
};
