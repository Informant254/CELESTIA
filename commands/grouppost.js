const crypto = require('crypto');
const {
  downloadMediaMessage,
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

function mediaType(message) {
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return message.videoMessage.gifPlayback ? 'gif' : 'video';
  if (message.audioMessage) return message.audioMessage.ptt ? 'ptt' : 'audio';
  if (message.stickerMessage) return 'sticker';
  return null;
}

async function sendGroupStatus(sock, groupJid, content) {
  const inside = await generateWAMessageContent(content, {
    upload: sock.waUploadToServer,
  });

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
  console.log(`[CELESTIA GROUP STATUS] relayed type=${type || 'text'} id=${message.key.id}`);
  return message;
}

async function downloadSourceMedia(sock, msg, ctx, source, replied) {
  const key = replied
    ? {
        remoteJid: msg.key.remoteJid,
        id: ctx?.stanzaId,
        participant: ctx?.participant || msg.key.participant,
      }
    : msg.key;
  return downloadMediaMessage(
    { key, message: source },
    'buffer',
    {},
    { reuploadRequest: (message) => sock.updateMediaMessage(message) },
  );
}

module.exports = {
  name: 'grouppost',
  aliases: ['gpoststatus', 'groupstory'],
  description: 'CELESTIA Group Status: post text, music, images, videos or stickers for 24 hours.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!jid.endsWith('@g.us')) {
      return sock.sendMessage(jid, { text: '✦ CELESTIA Group Status only works inside a group.' }, { quoted: msg });
    }
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '✦ Only the CELESTIA owner can publish a Group Status.' }, { quoted: msg });
    }

    const input = args.join(' ').trim();
    const ctx = contextInfo(msg);
    const quoted = unwrapQuoted(ctx?.quotedMessage);
    const current = unwrapQuoted(msg.message);
    const supported = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'];
    const currentMediaType = Object.keys(current || {}).find((key) => supported.includes(key));
    const source = quoted || (currentMediaType ? current : null);
    const replied = Boolean(quoted);

    if (!source && !input) {
      return sock.sendMessage(jid, {
        text: '✦ *CELESTIA GROUP STATUS*\n\nUse `.grouppost <text>`, add it to an image/video caption, or reply to text/music/image/video/sticker with `.grouppost [caption]`.',
      }, { quoted: msg });
    }

    try {
      const sourceText = source?.conversation || source?.extendedTextMessage?.text;
      if (!source || sourceText) {
        await sendGroupStatus(sock, jid, { text: input || sourceText });
        return;
      }

      const sourceType = Object.keys(source).find((key) => supported.includes(key));
      if (!sourceType) {
        return sock.sendMessage(jid, { text: '✦ CELESTIA supports text, music, images, videos and stickers for Group Status.' }, { quoted: msg });
      }

      const buffer = await module.exports.downloadSourceMedia(sock, msg, ctx, source, replied);
      if (!buffer?.length) throw new Error('WhatsApp returned an empty media file');
      const sourceMedia = source[sourceType];
      let content;
      if (sourceType === 'imageMessage') {
        content = {
          image: buffer,
          caption: input || sourceMedia.caption || '',
          mimetype: sourceMedia.mimetype || 'image/jpeg',
          jpegThumbnail: sourceMedia.jpegThumbnail,
          width: sourceMedia.width,
          height: sourceMedia.height,
        };
      } else if (sourceType === 'videoMessage') {
        content = {
          video: buffer,
          caption: input || sourceMedia.caption || '',
          mimetype: sourceMedia.mimetype || 'video/mp4',
          gifPlayback: Boolean(sourceMedia.gifPlayback),
          jpegThumbnail: sourceMedia.jpegThumbnail,
          width: sourceMedia.width,
          height: sourceMedia.height,
          seconds: sourceMedia.seconds,
        };
      } else if (sourceType === 'audioMessage') {
        content = {
          audio: buffer,
          mimetype: sourceMedia.mimetype || 'audio/mpeg',
          ptt: Boolean(sourceMedia.ptt),
          seconds: sourceMedia.seconds,
          waveform: sourceMedia.waveform,
        };
      } else {
        content = { sticker: buffer, mimetype: sourceMedia.mimetype || 'image/webp' };
      }
      await sendGroupStatus(sock, jid, content);
    } catch (error) {
      console.error('[GROUPPOST ERROR]', error);
      return sock.sendMessage(jid, { text: `✦ CELESTIA could not publish this Group Status: ${error.message}` }, { quoted: msg });
    }
  },
  sendGroupStatus,
  downloadSourceMedia,
};
