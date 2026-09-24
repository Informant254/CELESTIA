const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');

// Resolve an inbox-supplied group: invite link, group JID, or bare digits.
async function resolveTargetGroup(sock, ref) {
  const s = String(ref || '').trim();
  if (s.endsWith('@g.us')) return s;
  if (/^\d{15,}$/.test(s.replace(/[^0-9]/g, '')) && !s.includes('chat.whatsapp.com')) {
    return `${s.replace(/[^0-9]/g, '')}@g.us`;
  }
  const m = s.match(/chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{10,40})/i);
  const code = m ? m[1].split('?')[0].split('#')[0] : (/^[A-Za-z0-9_-]{10,40}$/.test(s) ? s : null);
  if (!code) throw new Error('not a group link, JID, or ID');
  const info = await sock.groupGetInviteInfo(code);
  if (!info?.id) throw new Error('invite did not resolve to a group');
  return info.id;
}

module.exports = {
  name: 'antikill',
  aliases: ['antiraid', 'antimasskick'],
  description: '🛡️ Instant recovery from mass-removals. In group: .antikill on|off. Inbox: add group link/JID. .antikill warns <n> sets strike limit.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid; // replies go here (group or inbox)
    const inGroup = jid.endsWith('@g.us');

    // Figure out the target group + where the subcommand sits.
    let targetJid = jid;
    let subIdx = 0;
    if (!inGroup) {
      if (!isOwner(msg)) {
        return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this from inbox.*' }, { quoted: msg });
      }
      const ref = args[0];
      if (!ref || /^(on|off|status|warns)$/i.test(ref)) {
        return sock.sendMessage(jid, { text: '❌ *Inbox usage:* name the group first.\n\n*.antikill <group-link|JID> on*\n*.antikill <group-link|JID> warns 2*' }, { quoted: msg });
      }
      try {
        targetJid = await resolveTargetGroup(sock, ref);
      } catch (e) {
        return sock.sendMessage(jid, { text: `❌ Could not resolve that group: ${String(e.message || e).slice(0, 120)}` }, { quoted: msg });
      }
      subIdx = 1;
    }
    const sub = (args[subIdx] || (inGroup ? 'status' : 'on')).toLowerCase();
    const val = args[subIdx + 1];

    let metadata;
    try {
      metadata = await sock.groupMetadata(targetJid);
    } catch (e) {
      return sock.sendMessage(jid, { text: `❌ Can't read that group: ${e.message}` }, { quoted: msg });
    }
    if (inGroup) {
      const sender = msg.key.participant || msg.key.remoteJid;
      if (!isOwner(msg) && !isSenderAdmin(metadata, sender)) {
        return sock.sendMessage(jid, { text: '❌ *Group admins or the bot owner only.*' }, { quoted: msg });
      }
    }
    const name = metadata.subject || targetJid;

    if (sub === 'on') {
      groupSettingsStore.set(targetJid, 'antikill', true);
      return sock.sendMessage(jid, { text: `🛡️ *AntiKill ON for ${name}.*\n_Hostile kicks are re-added instantly; repeat attackers get demoted + removed. Bot must stay admin._` }, { quoted: msg });
    }
    if (sub === 'off') {
      groupSettingsStore.set(targetJid, 'antikill', false);
      return sock.sendMessage(jid, { text: `🛡️ *AntiKill OFF for ${name}.*` }, { quoted: msg });
    }
    if (sub === 'warns' || sub === 'warn' || sub === 'limit' || sub === 'strikes') {
      const n = parseInt(val, 10);
      if (!n || n < 1 || n > 10) {
        const cur = groupSettingsStore.get(targetJid, 'antikill_limit', 3);
        const where = inGroup ? '' : '*.antikill <group-link|JID> warns <n>*';
        return sock.sendMessage(jid, { text: `❌ *Give 1–10.* Usage: ${inGroup ? '*.antikill warns <n>*' : where}\n_Current limit for ${name}: ${cur} strike(s)._` }, { quoted: msg });
      }
      groupSettingsStore.set(targetJid, 'antikill_limit', n);
      return sock.sendMessage(jid, { text: `🛡️ *${name}:* attacker neutralized after *${n}* strike(s).` }, { quoted: msg });
    }
    const on = groupSettingsStore.get(targetJid, 'antikill', false) === true;
    const limit = groupSettingsStore.get(targetJid, 'antikill_limit', 3);
    const refHint = inGroup ? '' : ' <group-link|JID>';
    return sock.sendMessage(jid, { text: `🛡️ *ANTIKILL — ${name}:* ${on ? 'ON' : 'OFF'} (limit ${limit})\n\n*.antikill${refHint} on|off*\n*.antikill${refHint} warns <1-10>*` }, { quoted: msg });
  },
};
