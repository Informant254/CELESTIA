const fs = require('fs');
const path = require('path');
const settingsStore = require('../utils/settingsStore');
const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

const listPath = path.join(__dirname, '../config/badwords.json');

function load() {
    if (fs.existsSync(listPath)) return JSON.parse(fs.readFileSync(listPath, 'utf8'));
    return [];
}
function save(list) {
    fs.writeFileSync(listPath, JSON.stringify(list, null, 2));
}

const MODES = ['off', 'on', 'warn', 'kick'];

function show(value) {
  if (value === true) return 'KICK (legacy on)';
  if (typeof value === 'string' && MODES.includes(value)) return value.toUpperCase();
  return 'OFF';
}

module.exports = {
    name: 'badword',
    description: 'Manage the bad word filter. Usage: .badword on|off|warn|kick|add <word>|remove <word>|list (on = delete only, warn = 3 strikes then kick, kick = delete + immediate kick)',
    async execute(sock, msg, args) {
        if (!isOwner(msg) && !isSudo(msg)) return;
        const jid = msg.key.remoteJid;
        const sub = args[0]?.toLowerCase();

        if (MODES.includes(sub)) {
            settingsStore.set('badword', sub === 'off' ? false : sub);
            return sock.sendMessage(jid, { text: `🚫 *Bad Word Filter:* ${show(settingsStore.get('badword', false))}` });
        }
        if (sub === 'add') {
            const word = args[1]?.toLowerCase();
            if (!word) return sock.sendMessage(jid, { text: '❌ Usage: .badword add <word>' }, { quoted: msg });
            const list = load();
            if (!list.includes(word)) list.push(word);
            save(list);
            return sock.sendMessage(jid, { text: `✅ Added "${word}" to the bad word list.` }, { quoted: msg });
        }
        if (sub === 'remove') {
            const word = args[1]?.toLowerCase();
            if (!word) return sock.sendMessage(jid, { text: '❌ Usage: .badword remove <word>' }, { quoted: msg });
            save(load().filter(w => w !== word));
            return sock.sendMessage(jid, { text: `✅ Removed "${word}" from the bad word list.` }, { quoted: msg });
        }
        if (sub === 'list') {
            const list = load();
            return sock.sendMessage(jid, { text: list.length ? `📋 *Bad words:*\n${list.join(', ')}` : '📋 List is empty.' }, { quoted: msg });
        }

        await sock.sendMessage(jid, {
            text: `🚫 *Bad Word Filter Status:* ${show(settingsStore.get('badword', false))}\n\n💡 Use .badword on|off|warn|kick|add <word>|remove <word>|list`
        });
    },
};
