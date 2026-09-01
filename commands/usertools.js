const https = require('https');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function formatTimestamp(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return {
    day: days[d.getDay()],
    date: d.getDate(),
    month: months[d.getMonth()],
    year: d.getFullYear(),
    time: d.toLocaleTimeString('en-US'),
  };
}

module.exports = [


  // ── FULLPP ──
  {
    name: 'fullpp',
    aliases: ['setpp'],
    description: "Set your WhatsApp profile picture from a replied image. Usage: reply to an image with .fullpp",
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;

      if (!isOwner(msg)) {
        return sock.sendMessage(jid, { text: '❌ *Only the owner can change the profile picture.*' }, { quoted: msg });
      }

      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;

      if (!quoted?.imageMessage) {
        return sock.sendMessage(jid, { text: '❌ *Reply to an image with .fullpp*' }, { quoted: msg });
      }

      try {
        const media = await downloadMediaMessage(
          { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
          'buffer',
          {}
        );

        await sock.updateProfilePicture(sock.user.id, media);
        await sock.sendMessage(jid, { text: '✅ *Profile picture updated.*' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Could not update profile picture: ${e.message}*` }, { quoted: msg });
      }
    }
  },

  // ── JID ───────────────────────────────────────────────
  {
    name: 'jid',
    description: 'Get your own or a tagged user\'s JID. Usage: .jid or .jid @user',
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const target = ctx?.mentionedJid?.[0] || ctx?.participant || (msg.key.participant || msg.key.remoteJid);

      await sock.sendMessage(jid, { text: `🆔 *JID:*\n${target}` }, { quoted: msg });
    }
  },

  // ── GJID ──────────────────────────────────────────────
  {
    name: 'gjid',
    description: "Get the current group's JID.",
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;
      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(jid, { text: '❌ *This command only works in groups.*' }, { quoted: msg });
      }
      await sock.sendMessage(jid, { text: `🆔 *Group JID:*\n${jid}` }, { quoted: msg });
    }
  },

   // ── LEFT ─────────────────────────────────────────────
  {
    name: 'left',
    description: 'Make the bot leave the current group.',
    async execute(sock, msg) {
      const jid = msg.key.remoteJid;

      if (!jid.endsWith('@g.us')) {
        return sock.sendMessage(
          jid,
          { text: '❌ *This command only works in groups.*' },
          { quoted: msg }
        );
      }

      if (!isOwner(msg)) {
        return sock.sendMessage(
          jid,
          { text: '❌ *Only the bot owner can use this command.*' },
          { quoted: msg }
        );
      }

      await sock.sendMessage(
        jid,
        { text: '😡 *Goodbye idiots! CELESTIA is leaving this group now.*' },
        { quoted: msg }
      );

      await sock.groupLeave(jid);
    }
  },
];
