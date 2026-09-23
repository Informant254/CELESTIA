const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

module.exports = {
  name: 'antikill',
  aliases: ['antiraid', 'antimasskick'],
  description: '🛡️ Instant recovery from mass-removals (group admin/owner). .antikill on|off|status',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '❌ *Use this inside a group.*' }, { quoted: msg });
    }
    let metadata;
    try {
      metadata = await sock.groupMetadata(jid);
    } catch (e) {
      return sock.sendMessage(jid, { text: `❌ Can't read group info: ${e.message}` }, { quoted: msg });
    }
    const sender = msg.key.participant || msg.key.remoteJid;
    if (!isOwner(msg) && !isSenderAdmin(metadata, sender)) {
      return sock.sendMessage(jid, { text: '❌ *Group admins or the bot owner only.*' }, { quoted: msg });
    }
    const sub = (args[0] || 'status').toLowerCase();
    if (sub === 'on') {
      groupSettingsStore.set(jid, 'antikill', true);
      return sock.sendMessage(jid, { text: '🛡️ *AntiKill ON.*\n_Hostile kicks are re-added instantly; repeat attackers get demoted + removed. Bot must stay admin._' }, { quoted: msg });
    }
    if (sub === 'off') {
      groupSettingsStore.set(jid, 'antikill', false);
      return sock.sendMessage(jid, { text: '🛡️ *AntiKill OFF.*' }, { quoted: msg });
    }
    const on = groupSettingsStore.get(jid, 'antikill', false) === true;
    return sock.sendMessage(jid, { text: `🛡️ *ANTIKILL:* ${on ? 'ON' : 'OFF'}\n\n*.antikill on|off*` }, { quoted: msg });
  },
};
