const { downloadMediaMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');

function unwrapViewOnce(message) {
  if (!message) return null;
  let m = message;
  // Some clients wrap view-once inside an ephemeral (disappearing message) wrapper first
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) return m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) return m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension?.message) return m.viewOnceMessageV2Extension.message;
  return m;
}

function getQuotedViewOnce(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return null;
  const unwrapped = unwrapViewOnce(quoted);
  if (!unwrapped) return null;
  if (unwrapped.imageMessage) return { type: 'image', message: unwrapped.imageMessage };
  if (unwrapped.videoMessage) return { type: 'video', message: unwrapped.videoMessage };
  return null;
}

module.exports = {
  name: 'vv2',
  aliases: ['mmh', 'uhm'],
  noprefix: ['😂', '😍', '🌚', '🌝', '😊', '😉', '🙄', '😅', '🫠', '🙂', '🥰', '😘', '🤩', '😙', '🤢', '🤔', '🫣'],
  description: 'Reveal a quoted view-once message and DM it to the owner (owner-only)',
  async execute(sock, msg) {
    // Owner-only, silent no-op for anyone else — matches the pattern
    // used elsewhere in this bot (e.g. antigm/antitag owner checks).
    if (!isOwner(msg)) return;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    if (!ctx?.quotedMessage) return; // silent, same as the original snippet's `if (!m.quoted) return;`

    const found = getQuotedViewOnce(msg);
    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    if (!selfJid) {
      await sock.sendMessage(msg.key.remoteJid, { text: '❌ Bot session not ready — try again shortly.' }, { quoted: msg });
      return;
    }

    if (!found) {
      await sock.sendMessage(selfJid, { text: 'Could not find the view-once message.' });
      return;
    }

    try {
      const buffer = await downloadMediaMessage(
        { message: { [`${found.type}Message`]: found.message } },
        'buffer',
        {}
      );
      const caption = found.message.caption
        ? `Retrieved by CELESTIA!\n${found.message.caption}`
        : 'Retrieved by CELESTIA!';

      if (found.type === 'image') {
        await sock.sendMessage(selfJid, { image: buffer, caption }, { quoted: msg });
      } else {
        await sock.sendMessage(selfJid, { video: buffer, caption }, { quoted: msg });
      }
    } catch (error) {
      await sock.sendMessage(selfJid, { text: `❌ Failed to retrieve view-once media: ${error.message}` });
    }
  },
};
