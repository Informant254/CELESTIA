const {
  downloadMediaMessage,
  normalizeMessageContent,
} = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const { contextInfo } = require('../utils/jidResolver');
const { prepareStatusAudio } = require('../utils/groupStatusAudio');

function unwrapQuoted(quoted) {
  if (!quoted) return null;
  try {
    return normalizeMessageContent(quoted) || quoted;
  } catch {
    return quoted;
  }
}

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

function dmUsage() {
  return '✦ *CELESTIA GROUP STATUS (DM)*\n\nUse `.gstatus <group-link|JID> <text>`, or reply to text/music/image/video/sticker with `.gstatus <group-link|JID> [caption]`.\n\nMusic is converted to a voice-status clip (up to the first 4 minutes).';
}

async function sendGroupStatus(sock, groupJid, content) {
  if (typeof sock.sendGroupStatus !== 'function') {
    throw new Error('CELESTIA Group Status transport is unavailable');
  }
  const message = await sock.sendGroupStatus(groupJid, content);
  const type = content.image ? 'image'
    : content.video ? (content.gifPlayback ? 'gif' : 'video')
      : content.audio ? (content.ptt ? 'ptt' : 'audio')
        : content.sticker ? 'sticker'
          : 'text';
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
  description: 'CELESTIA Group Status: post text, images, videos, stickers or a music clip up to 4 minutes for 24 hours. Works in groups and owner DMs (in DMs name the group first).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const inGroup = jid.endsWith('@g.us');
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '✦ Only the CELESTIA owner can publish a Group Status.' }, { quoted: msg });
    }

    let targetJid = jid;
    let targetName = null;
    let contentArgs = args;
    if (!inGroup) {
      const ref = args[0];
      if (!ref) {
        return sock.sendMessage(jid, { text: dmUsage() }, { quoted: msg });
      }
      try {
        targetJid = await resolveTargetGroup(sock, ref);
      } catch {
        return sock.sendMessage(jid, { text: `✦ CELESTIA could not resolve that group. ${dmUsage()}` }, { quoted: msg });
      }
      contentArgs = args.slice(1);
      try {
        const metadata = await sock.groupMetadata(targetJid);
        targetName = metadata?.subject || targetJid;
      } catch (error) {
        return sock.sendMessage(jid, { text: `✦ CELESTIA could not read that group: ${error.message}` }, { quoted: msg });
      }
    }

    const input = contentArgs.join(' ').trim();
    const ctx = contextInfo(msg);
    const quoted = unwrapQuoted(ctx?.quotedMessage);
    const current = unwrapQuoted(msg.message);
    const supported = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'];
    const currentMediaType = Object.keys(current || {}).find((key) => supported.includes(key));
    const source = quoted || (currentMediaType ? current : null);
    const replied = Boolean(quoted);

    if (!source && !input) {
      return sock.sendMessage(jid, {
        text: inGroup
          ? '✦ *CELESTIA GROUP STATUS*\n\nUse `.grouppost <text>`, add it to an image/video caption, or reply to text/music/image/video/sticker with `.grouppost [caption]`.\n\nMusic is converted to a voice-status clip (up to the first 4 minutes).'
          : dmUsage(),
      }, { quoted: msg });
    }

    try {
      const sourceText = source?.conversation || source?.extendedTextMessage?.text;
      if (!source || sourceText) {
        await sendGroupStatus(sock, targetJid, { text: input || sourceText });
        if (!inGroup) {
          return sock.sendMessage(jid, { text: `✦ CELESTIA posted that Group Status to *${targetName || targetJid}*.` }, { quoted: msg });
        }
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
        content = await module.exports.prepareStatusAudio(buffer);
      } else {
        content = { sticker: buffer, mimetype: sourceMedia.mimetype || 'image/webp' };
      }
      await sendGroupStatus(sock, targetJid, content);
      if (!inGroup) {
        return sock.sendMessage(jid, { text: `✦ CELESTIA posted that Group Status to *${targetName || targetJid}*.` }, { quoted: msg });
      }
    } catch (error) {
      console.error('[GROUPPOST ERROR]', error);
      return sock.sendMessage(jid, { text: `✦ CELESTIA could not publish this Group Status: ${error.message}` }, { quoted: msg });
    }
  },
  sendGroupStatus,
  resolveTargetGroup,
  downloadSourceMedia,
  prepareStatusAudio,
};
