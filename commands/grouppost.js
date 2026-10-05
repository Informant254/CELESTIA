const crypto = require('crypto');
const {
  generateWAMessageContent,
  generateWAMessageFromContent,
  jidNormalizedUser,
  normalizeMessageContent,
} = require('@whiskeysockets/baileys');
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

function withCaption(message, caption) {
  if (!caption) return message;
  if (message.imageMessage) {
    return { ...message, imageMessage: { ...message.imageMessage, caption } };
  }
  if (message.videoMessage) {
    return { ...message, videoMessage: { ...message.videoMessage, caption } };
  }
  return message;
}

function mediaType(message) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return message.videoMessage.gifPlayback ? 'gif' : 'video';
  if (message.audioMessage) return message.audioMessage.ptt ? 'ptt' : 'audio';
  if (message.stickerMessage) return 'sticker';
  return null;
}

async function sendGroupStatus(sock, groupJid, content, quoted = false) {
  let inside;
  if (quoted) {
    inside = content;
  } else {
    inside = await generateWAMessageContent(content, {
      upload: sock.waUploadToServer,
    });
  }

  const messageSecret = crypto.randomBytes(32);
  const userJid = jidNormalizedUser(sock.user?.id || '');
  const message = generateWAMessageFromContent(groupJid, {
    messageContextInfo: { messageSecret },
    groupStatusMessageV2: {
      message: {
        ...inside,
        messageContextInfo: { messageSecret },
      },
    },
  }, { userJid });

  const type = mediaType(inside);
  await sock.relayMessage(groupJid, message.message, {
    messageId: message.key.id,
    ...(type ? { additionalAttributes: { mediatype: type } } : {}),
  });
  return message;
}

module.exports = {
  name: 'grouppost',
  aliases: ['gpoststatus', 'groupstory'],
  description: 'Post a real 24-hour Status in the current group (owner only).',
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
        await sendGroupStatus(sock, jid, { text: input || quotedText });
        return;
      }

      const mediaType = Object.keys(quoted).find((key) =>
        ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(key)
      );
      if (!mediaType) {
        return sock.sendMessage(jid, { text: 'Reply to text, image, video, audio, or a sticker.' }, { quoted: msg });
      }

      // Reuse the encrypted media reference. Downloading and re-uploading an
      // older reply can fail even though WhatsApp can still relay it in-group.
      const content = withCaption({ [mediaType]: quoted[mediaType] }, input);
      await sendGroupStatus(sock, jid, content, true);
    } catch (error) {
      console.error('[GROUPPOST ERROR]', error);
      return sock.sendMessage(jid, { text: `Unable to post group Status: ${error.message}` }, { quoted: msg });
    }
  },
  sendGroupStatus,
};
