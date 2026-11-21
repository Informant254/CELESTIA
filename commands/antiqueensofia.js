const { isOwner } = require('../utils/isOwner');
const { isSenderAdmin } = require('../utils/isAdmin');
const groupSettingsStore = require('../utils/groupSettingsStore');
const antiname = require('../utils/antiname');

// Resolve a group reference from inbox: invite link, group JID, or bare ID.
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

function fmtTargets(list) {
  return (list || []).map((t) => `• ${t}`).join('\n') || '• (none)';
}

module.exports = {
  name: 'antiqueensofia',
  aliases: ['antisoofia', 'noqueensofia'],
  description: '🚫 Removes anyone using a banned display name (default: Queen Sofia). In group: .antiqueensofia on|off|status. Inbox: add group link/JID. .antiqueensofia target <name, name2>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const inGroup = String(jid || '').endsWith('@g.us');

    let targetJid = jid;
    let subIdx = 0;
    if (!inGroup) {
      if (!isOwner(msg)) {
        return sock.sendMessage(jid, { text: '❌ *Only the bot owner can use this from inbox.*' }, { quoted: msg });
      }
      const ref = args[0];
      if (!ref || /^(on|off|status|target|targets)$/i.test(ref)) {
        return sock.sendMessage(jid, {
          text: '❌ *Inbox usage:* name the group first.\n\n*.antiqueensofia <group-link|JID> on*\n*.antiqueensofia <group-link|JID> status*\n*.antiqueensofia <group-link|JID> target Queen Sofia*',
        }, { quoted: msg });
      }
      try {
        targetJid = await resolveTargetGroup(sock, ref);
      } catch (e) {
        return sock.sendMessage(jid, { text: `❌ Could not resolve that group: ${String(e.message || e).slice(0, 120)}` }, { quoted: msg });
      }
      subIdx = 1;
    }

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
    const sub = (args[subIdx] || (inGroup ? 'status' : 'on')).toLowerCase();

    if (sub === 'on') {
      groupSettingsStore.set(targetJid, 'antiname', true);
      return sock.sendMessage(jid, {
        text: `🚫 *Anti-Queen Sofia ON for ${name}.*\n_Banned names:_\n${fmtTargets(antiname.targetsFor(targetJid))}\n\nAnyone using one is removed the moment they speak. Bot must stay admin._`,
      }, { quoted: msg });
    }

    if (sub === 'off') {
      groupSettingsStore.set(targetJid, 'antiname', false);
      return sock.sendMessage(jid, { text: `🚫 *Anti-Queen Sofia OFF for ${name}.*` }, { quoted: msg });
    }

    if (sub === 'target' || sub === 'targets' || sub === 'name' || sub === 'names') {
      const raw = args.slice(subIdx + 1).join(' ').trim();
      if (!raw) {
        return sock.sendMessage(jid, {
          text: `🎯 *Banned names for ${name}:*\n${fmtTargets(antiname.targetsFor(targetJid))}\n\n_Set new ones:_ *.antiqueensofia target Queen Sofia, Fake Admin*\n_Reset:_ *.antiqueensofia target reset*`,
        }, { quoted: msg });
      }
      if (/^(reset|default|clear)$/i.test(raw)) {
        groupSettingsStore.set(targetJid, 'antiname_targets', null);
        return sock.sendMessage(jid, {
          text: `🎯 *Reset to default for ${name}:*\n${fmtTargets(antiname.DEFAULT_TARGETS)}`,
        }, { quoted: msg });
      }
      const list = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10);
      if (!list.length) {
        return sock.sendMessage(jid, { text: '❌ Give at least one name.' }, { quoted: msg });
      }
      groupSettingsStore.set(targetJid, 'antiname_targets', list);
      return sock.sendMessage(jid, {
        text: `🎯 *Banned names updated for ${name}:*\n${fmtTargets(list)}`,
      }, { quoted: msg });
    }

    const on = groupSettingsStore.get(targetJid, 'antiname', false) === true;
    return sock.sendMessage(jid, {
      text: `🚫 *Anti-Queen Sofia — ${on ? 'ON' : 'OFF'}*\n*Group:* ${name}\n*Banned names:*\n${fmtTargets(antiname.targetsFor(targetJid))}\n\n_Toggle:_ *.antiqueensofia on|off*`,
    }, { quoted: msg });
  },
};
