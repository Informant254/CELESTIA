const { isOwner } = require('../utils/isOwner');
const settingsStore = require('../utils/settingsStore');
const mirror = require('../utils/mirror');

module.exports = {
  name: 'mirroragent',
  description: '🪞 Join the mirror fleet (owner only). .mirroragent on|off|link|unlink|status',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this command.*' }, { quoted: msg });
    }
    const sub = (args[0] || 'status').toLowerCase();
    const rest = args.slice(1).join(' ').trim().replace(/[^0-9]/g, '');

    if (sub === 'on') {
      if (!mirror.getMaster()) {
        return sock.sendMessage(jid, { text: '❌ *Link a master first:*\n.mirroragent link <master-number>' }, { quoted: msg });
      }
      settingsStore.set(mirror.AGENT_ON_KEY, true);
      return sock.sendMessage(jid, { text: '🪞 *Mirror agent ON.*\n_This bot now obeys its linked master for safe read-only commands._' }, { quoted: msg });
    }
    if (sub === 'off') {
      settingsStore.set(mirror.AGENT_ON_KEY, false);
      return sock.sendMessage(jid, { text: '🪞 *Mirror agent OFF.*' }, { quoted: msg });
    }
    if (sub === 'link' && rest) {
      if (!/^\d{7,16}$/.test(rest)) {
        return sock.sendMessage(jid, { text: '❌ *Bad number.* Usage: *.mirroragent link 2547...*' }, { quoted: msg });
      }
      settingsStore.set(mirror.MASTER_KEY, rest);
      return sock.sendMessage(jid, { text: `🪞 *Master linked: +${rest}*\n_Turn the agent on with .mirroragent on._` }, { quoted: msg });
    }
    if (sub === 'unlink') {
      settingsStore.set(mirror.MASTER_KEY, null);
      settingsStore.set(mirror.AGENT_ON_KEY, false);
      return sock.sendMessage(jid, { text: '🪞 *Master unlinked, agent off.*' }, { quoted: msg });
    }
    const master = mirror.getMaster();
    return sock.sendMessage(jid, {
      text: `🪞 *MIRROR AGENT:* ${mirror.agentOn() ? 'ON' : 'OFF'}\n• Master: ${master ? `+${master}` : 'none'}\n• Remote commands: ${[...mirror.AGENT_WHITELIST].join(', ')}\n\n*.mirroragent link <number> → on*`,
    }, { quoted: msg });
  },
};
