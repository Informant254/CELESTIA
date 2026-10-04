const { downloadMediaMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const { contextInfo } = require('../utils/jidResolver');

function unwrapQuoted(quoted) {
  if (!quoted) return null;
  try {
    return normalizeMessageContent(quoted) || quoted;
  } catch {
    return quoted;
  }
}

module.exports = {
  name: 'grouppost',
  aliases: ['gpoststatus', 'groupstory'],
  description: 'Post a status-style update inside the current group (owner only).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: 'This command only works in a group.' }, { quoted: msg });
    }
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: 'Only the bot owner can publish a group Status.' }, { quoted: msg });
    }

    const input = args.join(' ').trim();
    const ctx = contextInfo(msg);
    const quoted = unwrapQuoted(ctx?.quotedMessage);
    if (!quoted && !input) {
      return sock.sendMessage(jid, {
        text: 'Usage: `.grouppost <text>` or reply to text/image/video/audio/sticker with `.grouppost [caption]`.',
      }, { quoted: msg });
    }

    try {
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
      if (!quoted || quotedText) {
        const text = input || quotedText;
        if (!text) {
          return sock.sendMessage(jid, { text: 'Give me some text to post.' }, { quoted: msg });
        }
        await sock.sendMessage(jid, { text: `📢 *GROUP STATUS*\n\n${text}` }, { quoted: msg });
        return;
      }

      const mediaType = Object.keys(quoted).find((key) =>
        ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(key)
      );
      if (!mediaType) {
        return sock.sendMessage(jid, { text: 'Reply to text, image, video, audio, or a sticker.' }, { quoted: msg });
      }
      const buffer = await downloadMediaMessage({
        message: quoted,
        key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant || msg.key.participant },
      }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      if (!buffer) throw new Error('replied media could not be downloaded');
      const caption = input || quoted[mediaType]?.caption || '';
      const header = '📢 *GROUP STATUS*';
      let content;
      if (mediaType === 'imageMessage') content = { image: buffer, caption: caption ? `${header}\n\n${caption}` : header };
      if (mediaType === 'videoMessage') content = { video: buffer, caption: caption ? `${header}\n\n${caption}` : header };
      if (mediaType === 'audioMessage') content = { audio: buffer, mimetype: quoted.audioMessage?.mimetype || 'audio/mp4' };
      if (mediaType === 'stickerMessage') content = { sticker: buffer };
      await sock.sendMessage(jid, content, { quoted: msg });
      if (mediaType === 'audioMessage' && caption) {
        await sock.sendMessage(jid, { text: `${header}\n\n${caption}` }, { quoted: msg });
      }
      if (mediaType === 'stickerMessage' && caption) {
        await sock.sendMessage(jid, { text: `${header}\n\n${caption}` }, { quoted: msg });
      }
    } catch (error) {
      console.error('[GROUPPOST ERROR]', error);
      return sock.sendMessage(jid, { text: `Failed to post group Status: ${error.message}` }, { quoted: msg });
    }
  },
};
