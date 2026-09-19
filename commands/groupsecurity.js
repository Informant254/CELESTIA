const groupSettingsStore = require('../utils/groupSettingsStore');
const { isOwner } = require('../utils/isOwner');
const { isBotAdmin, isSenderAdmin } = require('../utils/isAdmin');

async function checkAdminPerms(sock, msg) {
  const jid = msg.key.remoteJid;
  const metadata = await sock.groupMetadata(jid);
  const senderJid = msg.key.participant || jid;

  if (!isOwner(msg) && !isSenderAdmin(metadata, senderJid)) {
    await sock.sendMessage(jid, { text: '❌ Only group admins can use this command.' }, { quoted: msg });
    return false;
  }
  return metadata;
}

const MODES = ['off', 'on', 'warn', 'kick'];

function showMode(value, legacyTrue) {
  if (value === true) return `${legacyTrue.toUpperCase()} (legacy on)`;
  if (typeof value === 'string' && MODES.includes(value)) return value.toUpperCase();
  return '❌ OFF';
}

function requireBotAdmin(sock, metadata, jid, msg) {
  if (isBotAdmin(sock, metadata)) return true;
  sock.sendMessage(jid, {
    text: '❌ Make me a group admin first. WhatsApp only lets group admins delete or remove messages.',
  }, { quoted: msg }).catch(() => {});
  return false;
}

// Unified punishment-mode command: off = disabled · on = delete only ·
// warn = delete + 3 strikes then kick · kick = delete + immediate kick.
function makeModeCommand(name, settingKey, label, emoji, legacyTrue = 'on') {
  return {
    name,
    description: `${label}. Usage: .${name} off|on|warn|kick`,
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const metadata = await checkAdminPerms(sock, msg);
      if (!metadata) return;

      const mode = args[0]?.toLowerCase();
      if (!MODES.includes(mode)) {
        return sock.sendMessage(jid, { text: `❌ Usage: .${name} off | on | warn | kick` }, { quoted: msg });
      }

      if (mode !== 'off' && !requireBotAdmin(sock, metadata, jid, msg)) return;

      groupSettingsStore.set(jid, settingKey, mode);
      await sock.sendMessage(jid, { text: `${emoji} ${label} set to *${mode.toUpperCase()}*.` }, { quoted: msg });
    }
  };
}

module.exports = [


  {
    name: 'antigm',
    aliases: ['antistatusmention', 'nostatus'],
    description: 'Anti-group-mention protection. Usage: .antigm off/on/kick/warn',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ Is this a group ? This command only works in groups.' }, { quoted: msg });
      }

      const metadata = await checkAdminPerms(sock, msg);
      if (!metadata) return;

      const mode = args[0]?.toLowerCase();
      if (!['off', 'on', 'kick', 'warn'].includes(mode)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .antigm off / on / kick / warn' }, { quoted: msg });
      }

      if (mode !== 'off' && !requireBotAdmin(sock, metadata, jid, msg)) return;

      groupSettingsStore.set(jid, 'antigm', mode);
      await sock.sendMessage(jid, { text: `🛡️ Antigm set to *${mode.toUpperCase()}*.` }, { quoted: msg });
    }
  },

  {
    name: 'antilink',
    aliases: ['nolinks'],
    description: 'Anti-link protection. Usage: .antilink off/on/kick/warn (on = delete only, warn = delete + warn, kick = delete + kick)',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const metadata = await checkAdminPerms(sock, msg);
      if (!metadata) return;

      const mode = args[0]?.toLowerCase();
      if (!['off', 'on', 'kick', 'warn'].includes(mode)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .antilink off / on / kick / warn' }, { quoted: msg });
      }

      if (mode !== 'off' && !isBotAdmin(sock, metadata)) {
        return sock.sendMessage(jid, {
          text: '❌ Make me a group admin first. WhatsApp only lets group admins delete other people’s links.',
        }, { quoted: msg });
      }

      groupSettingsStore.set(jid, 'antilink', mode);
      await sock.sendMessage(jid, { text: `🔗 Antilink set to *${mode.toUpperCase()}*.` }, { quoted: msg });
    }
  },

  makeModeCommand('antigstatus', 'antigstatus', 'Channel-invite spam protection', '🛡️'),
  makeModeCommand('antispam', 'antispam', 'Flood protection (>6 messages / 10s)', '🚫'),

  {
    name: 'antiword',
    aliases: ['noword'],
    description: 'Per-group banned word filter. Usage: .antiword off|on|warn|kick|add <word>|remove <word>|list',
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const metadata = await checkAdminPerms(sock, msg);
      if (!metadata) return;

      const sub = args[0]?.toLowerCase();
      if (MODES.includes(sub)) {
        if (sub !== 'off' && !requireBotAdmin(sock, metadata, jid, msg)) return;
        groupSettingsStore.set(jid, 'antiword', sub);
        return sock.sendMessage(jid, { text: `🤬 Antiword set to *${sub.toUpperCase()}*.` }, { quoted: msg });
      }
      if (sub === 'add' || sub === 'remove' || sub === 'list') {
        const list = groupSettingsStore.get(jid, 'antiwordlist', []);
        const clean = Array.isArray(list) ? list : [];
        if (sub === 'list') {
          return sock.sendMessage(jid, { text: clean.length ? `📋 *Blocked words:*\n${clean.join(', ')}` : '📋 No blocked words yet.' }, { quoted: msg });
        }
        const word = args[1]?.toLowerCase();
        if (!word) return sock.sendMessage(jid, { text: `❌ Usage: .antiword ${sub} <word>` }, { quoted: msg });
        groupSettingsStore.set(jid, 'antiwordlist', sub === 'add' ? [...new Set([...clean, word])] : clean.filter((w) => w !== word));
        return sock.sendMessage(jid, { text: sub === 'add' ? `✅ Blocked "${word}".` : `✅ Unblocked "${word}".` }, { quoted: msg });
      }
      const list = groupSettingsStore.get(jid, 'antiwordlist', []);
      return sock.sendMessage(jid, {
        text: `🤬 *Antiword:* ${showMode(groupSettingsStore.get(jid, 'antiword', 'off'), 'on')} (${Array.isArray(list) ? list.length : 0} words)\n\n💡 Use .antiword off|on|warn|kick|add <word>|remove <word>|list`,
      }, { quoted: msg });
    }
  },

  {
    name: 'common',
    description: 'Show current group protection settings.',
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const settings = groupSettingsStore.getAll(jid);
      const flag = (v) => v ? '✅ ON' : '❌ OFF';
      const mode = (v, legacyTrue = 'on') => showMode(v, legacyTrue);
      const wordCount = Array.isArray(settings.antiwordlist) ? settings.antiwordlist.length : 0;

      const text = `
╭──〔 🛡️ GROUP SETTINGS 〕──╮
🔗 Antilink: ${mode(settings.antilink)}
🚫 Antispam: ${mode(settings.antispam)}
🤬 Antiword: ${mode(settings.antiword)} (${wordCount} words)
🛡️ Antigm: ${mode(settings.antigm)}
🛡️ Antigstatus: ${mode(settings.antigstatus)}
👋 Welcome: ${flag(settings.welcome)}
👋 Goodbye: ${flag(settings.goodbye)}
╰──────────────────╯`.trim();

      await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  },

  {
    name: 'gpp',
    description: "Get the group's profile picture.",
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      try {
        const ppUrl = await sock.profilePictureUrl(jid, 'image');
        const https = require('https');
        const buffer = await new Promise((resolve, reject) => {
          https.get(ppUrl, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }).on('error', reject);
        });

        await sock.sendMessage(jid, { image: buffer, caption: '🖼 Group Profile Picture' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ This group has no profile picture set.' }, { quoted: msg });
      }
    }
  },

  {
    name: 'gstatus',
    aliases: ['gas', 'gps'],
    description: "Post a replied photo/video into this group's chat (not the bot's WhatsApp status). Usage: reply to media with .gstatus",
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;

      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      if (!quoted?.imageMessage && !quoted?.videoMessage) {
        return sock.sendMessage(jid, { text: '❌ Reply to a photo or video with .gstatus' }, { quoted: msg });
      }

      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const media = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );

        const type = quoted.imageMessage ? 'image' : 'video';
        const caption = quoted[`${type}Message`]?.caption || '';

        await sock.sendMessage(jid, { [type]: media, caption }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: '❌ Failed to post: ' + e.message }, { quoted: msg });
      }
    }
  },

];
