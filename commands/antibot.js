const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');

const MODES = ['off', 'on', 'warn', 'kick'];

function show(value) {
  if (value === true) return 'KICK (legacy on)';
  if (typeof value === 'string' && MODES.includes(value)) return value.toUpperCase();
  return 'OFF';
}

module.exports = {
    name: 'antibot',
    description: 'Remove bot-framework commands and automated widgets from non-admins. Usage: .antibot off|on|warn|kick (on = delete only, warn = 3 strikes then kick, kick = instant kick)',
    async execute(sock, msg, args) {
        if (!isOwner(msg)) return;

        const sub = args[0]?.toLowerCase();
        if (MODES.includes(sub)) {
            settingsStore.set('antibot', sub === 'off' ? false : sub);
            return await sock.sendMessage(msg.key.remoteJid, { text: `🤖 *Antibot:* ${show(settingsStore.get('antibot', false))}` });
        }

        await sock.sendMessage(msg.key.remoteJid, {
            text: `🤖 *Antibot Status:* ${show(settingsStore.get('antibot', false))}\n\n💡 Use \`.antibot off|on|warn|kick\``
        });
    },
};
