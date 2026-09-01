const { isOwner } = require('../utils/isOwner');
const { unbanUser, isBanned } = require('../utils/banList');

module.exports = {
    name: 'unban',
    description: 'Unbans a user, restoring their access to bot commands (owner only).',
    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;

        if (!isOwner(msg)) {
            return sock.sendMessage(jid, { text: '*❌ Only the bot owner can use this command.*' }, { quoted: msg });
        }

        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const repliedTo = msg.message?.extendedTextMessage?.contextInfo?.participant;
        const target = mentioned || repliedTo;

        if (!target) {
            return sock.sendMessage(jid, {
                text: '*❌ Who should I unban, mention or tag someone with the command.*',
            }, { quoted: msg });
        }

        if (!isBanned(target)) {
            return sock.sendMessage(jid, { text: `*ℹ️ @${target.split('@')[0]} is not banned.*`, mentions: [target] }, { quoted: msg });
        }

        unbanUser(target);

        await sock.sendMessage(jid, {
            text: `*✅ @${target.split('@')[0]} has been unbanned.*`,
            mentions: [target],
        }, { quoted: msg });
    },
};
