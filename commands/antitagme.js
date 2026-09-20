const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

const MODES = ['off', 'on', 'warn', 'kick'];

function show(value) {
    if (value === true) return 'ON (legacy)';
    if (typeof value === 'string' && MODES.includes(value)) return value.toUpperCase();
    return 'OFF';
}

module.exports = {
    name: 'antitagme',
    description: 'Personal shield: punish anyone who tags the owner. Usage: .antitagme off|on|warn|kick (on = delete only, warn = 3 strikes then kick, kick = delete + immediate kick)',
    async execute(sock, msg, args) {
        const jid = msg.key.remoteJid;

        if (!isOwner(msg) && !isSudo(msg)) {
            return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
        }

        const sub = args[0]?.toLowerCase();
        if (MODES.includes(sub)) {
            settingsStore.set('antitagme', sub === 'off' ? false : sub);
            return await sock.sendMessage(jid, { text: `🛡️ *AntiTagMe:* ${show(settingsStore.get('antitagme', false))}` }, { quoted: msg });
        }

        await sock.sendMessage(jid, {
            text: `🛡️ *AntiTagMe Status:* ${show(settingsStore.get('antitagme', false))}\n\n💡 Use \`.antitagme off|on|warn|kick\``
        }, { quoted: msg });
    },
};
