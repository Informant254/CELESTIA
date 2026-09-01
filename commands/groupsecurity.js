const groupSettingsStore = require('../utils/groupSettingsStore');
const { isOwner } = require('../utils/isOwner');

function makeToggleCommand(name, settingKey, label, emoji) {
  return {
    name,
    description: `Toggle ${label}. Usage: .${name} on/off`,
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ This command only works in groups.' }, { quoted: msg });
      }

      const mode = args[0]?.toLowerCase();
      if (mode !== 'on' && mode !== 'off') {
        return sock.sendMessage(jid, { text: `❌ Usage: .${name} on  or  .${name} off` }, { quoted: msg });
      }

      groupSettingsStore.set(jid, settingKey, mode === 'on');
      await sock.sendMessage(jid, { text: `${emoji} ${label} turned ${mode}.` }, { quoted: msg });
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

      const mode = args[0]?.toLowerCase();
      if (!['off', 'on', 'kick', 'warn'].includes(mode)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .antigm off / on / kick / warn' }, { quoted: msg });
      }

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

      const mode = args[0]?.toLowerCase();
      if (!['off', 'on', 'kick', 'warn'].includes(mode)) {
        return sock.sendMessage(jid, { text: '❌ Usage: .antilink off / on / kick / warn' }, { quoted: msg });
      }

      groupSettingsStore.set(jid, 'antilink', mode);
      await sock.sendMessage(jid, { text: `🔗 Antilink set to *${mode.toUpperCase()}*.` }, { quoted: msg });
    }
  },

  makeToggleCommand('antigstatus', 'antigstatus', 'Anti-group-status spam protection', '🛡️'),
  makeToggleCommand('antispam', 'antispam', 'Anti-spam protection', '🚫'),
  makeToggleCommand('antiword', 'antiword', 'Banned word filter', '🤬'),

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

      const text = `
╭──〔 🛡️ GROUP SETTINGS 〕──╮
🔗 Antilink: ${settings.antilink ? String(settings.antilink).toUpperCase() : '❌ OFF'}
🚫 Antispam: ${flag(settings.antispam)}
🤬 Antiword: ${flag(settings.antiword)}
🛡️ Antigm: ${settings.antigm ? String(settings.antigm).toUpperCase() : '❌ OFF'}
🛡️ Antigstatus: ${flag(settings.antigstatus)}
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
