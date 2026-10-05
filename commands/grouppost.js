const {
  downloadMediaMessage,
  normalizeMessageContent,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const { contextInfo } = require('../utils/jidResolver');
const { prepareStatusAudio } = require('../utils/groupStatusAudio');
const mediaStudio = require('../utils/mediaStudio');

const PERSONAL_STATUS_JID = 'status@broadcast';

function unwrapQuoted(quoted) {
  if (!quoted) return null;
  try {
    return normalizeMessageContent(quoted) || quoted;
  } catch {
    return quoted;
  }
}

function normalizeUserJid(jid) {
  if (!jid || typeof jid !== 'string') return null;
  try {
    const normalized = jidNormalizedUser(jid);
    if (normalized.endsWith('@s.whatsapp.net') || normalized.endsWith('@lid')) {
      return normalized;
    }
    return null;
  } catch {
    return null;
  }
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
  console.log(`[CELESTIA GROUP STATUS] published type=${type} id=${message?.key?.id || 'unknown'}`);
  return message;
}

async function getPersonalStatusRecipients(sock, groupJid) {
  const metadata = await sock.groupMetadata(groupJid);
  if (!metadata?.participants?.length) {
    throw new Error('Could not obtain group participants for WhatsApp Status');
  }
  const pnRecipients = new Set();
  const lidRecipients = new Set();
  for (const participant of metadata.participants) {
    const candidates = [participant.id, participant.phoneNumber, participant.lid];
    for (const candidate of candidates) {
      const jid = normalizeUserJid(candidate);
      if (!jid) continue;
      if (jid.endsWith('@s.whatsapp.net')) pnRecipients.add(jid);
      if (jid.endsWith('@lid')) lidRecipients.add(jid);
    }
  }
  let recipients;
  if (pnRecipients.size > 0) {
    recipients = [...pnRecipients];
    const self = normalizeUserJid(sock.user?.id);
    if (self?.endsWith('@s.whatsapp.net')) recipients.push(self);
  } else {
    recipients = [...lidRecipients];
    for (const candidate of [sock.user?.lid, sock.user?.id]) {
      const self = normalizeUserJid(candidate);
      if (self?.endsWith('@lid')) recipients.push(self);
    }
  }
  recipients = [...new Set(recipients.filter(Boolean))];
  if (!recipients.length) {
    throw new Error('No valid WhatsApp Status recipients could be resolved');
  }
  console.log(`[CELESTIA PERSONAL STATUS] recipients=${recipients.length} mode=${recipients[0]?.endsWith('@lid') ? 'LID' : 'PN'}`);
  return recipients;
}

async function sendPersonalStatus(sock, content, statusJidList) {
  if (!Array.isArray(statusJidList) || !statusJidList.length) {
    throw new Error('WhatsApp Status requires at least one recipient');
  }
  if (content.sticker) {
    console.warn('[CELESTIA PERSONAL STATUS] standalone sticker skipped');
    return null;
  }
  let personalContent = { ...content };
  const options = { statusJidList, broadcast: true };
  if (personalContent.text) {
    options.backgroundColor = '#111111';
    options.font = 1;
  }
  if (personalContent.audio) {
    personalContent = { ...personalContent, ptt: true };
    options.backgroundColor = '#000000';
  }
  const delivered = await mediaStudio.postStatus(sock, personalContent, options);
  console.log(`[CELESTIA PERSONAL STATUS] published recipients=${delivered}`);
  return { recipients: delivered };
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
  return '✦ *CELESTIA STATUS (DM)*\n\nPosts to Group Status AND your personal WhatsApp Status.\n\nUse `.gstatus <group-link|JID> <text>`, or reply to text/music/image/video/sticker with `.gstatus <group-link|JID> [caption]`.\n\nMusic is converted to a voice-status clip (up to the first 4 minutes).';
}

async function prepareStatusContent(sock, msg, ctx, source, replied, input = '') {
  const sourceText = source?.conversation || source?.extendedTextMessage?.text;
  if (!source || sourceText) return { text: input || sourceText };

  const supported = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'];
  const sourceType = Object.keys(source).find((key) => supported.includes(key));
  if (!sourceType) return null;

  const buffer = await module.exports.downloadSourceMedia(sock, msg, ctx, source, replied);
  if (!buffer?.length) throw new Error('WhatsApp returned an empty media file');
  const sourceMedia = source[sourceType];
  if (sourceType === 'imageMessage') {
    return {
      image: buffer,
      caption: input || sourceMedia.caption || '',
      mimetype: sourceMedia.mimetype || 'image/jpeg',
      jpegThumbnail: sourceMedia.jpegThumbnail,
      width: sourceMedia.width,
      height: sourceMedia.height,
    };
  }
  if (sourceType === 'videoMessage') {
    return {
      video: buffer,
      caption: input || sourceMedia.caption || '',
      mimetype: sourceMedia.mimetype || 'video/mp4',
      gifPlayback: Boolean(sourceMedia.gifPlayback),
      jpegThumbnail: sourceMedia.jpegThumbnail,
      width: sourceMedia.width,
      height: sourceMedia.height,
      seconds: sourceMedia.seconds,
    };
  }
  if (sourceType === 'audioMessage') return module.exports.prepareStatusAudio(buffer);
  return { sticker: buffer, mimetype: sourceMedia.mimetype || 'image/webp' };
}

async function publishEverywhere(sock, groupJid, content) {
  let statusJidList = [];
  try {
    statusJidList = await getPersonalStatusRecipients(sock, groupJid);
  } catch (error) {
    console.error('[PERSONAL STATUS RECIPIENT ERROR]', error);
  }

  await sendGroupStatus(sock, groupJid, content);

  if (!statusJidList.length) {
    return { group: true, personal: { status: 'skipped', reason: 'no recipients resolved' } };
  }
  try {
    const sent = await sendPersonalStatus(sock, content, statusJidList);
    if (!sent) {
      return { group: true, personal: { status: 'skipped', reason: 'stickers are not supported by personal Status' } };
    }
    return { group: true, personal: { status: 'published', recipients: sent.recipients } };
  } catch (error) {
    console.error('[CELESTIA PERSONAL STATUS ERROR]', error);
    return { group: true, personal: { status: 'failed', reason: error?.message || 'unknown error' } };
  }
}

function publishSummary(result, targetName) {
  const lines = [`✦ CELESTIA Group Status published${targetName ? ` to *${targetName}*` : ''}.`];
  const personal = result.personal;
  if (personal.status === 'published') {
    lines.push(`✦ Personal Status sent (${personal.recipients} recipients).`);
  } else if (personal.status === 'skipped') {
    lines.push(`✦ Personal Status skipped: ${personal.reason}.`);
  } else {
    lines.push(`✦ Personal Status failed: ${personal.reason}. Group Status is unaffected.`);
  }
  return lines.join('\n');
}

module.exports = {
  name: 'grouppost',
  aliases: ['gpoststatus', 'groupstory'],
  description: 'CELESTIA Status: publish text, images, videos and audio to Group Status and WhatsApp Status. Works in groups and owner DMs (in DMs name the group first).',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const inGroup = jid?.endsWith('@g.us');
    if (!isOwner(msg)) {
      return sock.sendMessage(jid, { text: '✦ Only the CELESTIA owner can publish a Status.' }, { quoted: msg });
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
      } catch {
        targetName = targetJid;
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
          ? '✦ *CELESTIA STATUS*\n\nPost to both Group Status and your normal WhatsApp Status.\n\n• `.grouppost <text>`\n• Add `.grouppost` as an image/video caption\n• Reply to text/music/image/video/sticker with `.grouppost [caption]`\n\nMusic is prepared as a playable status audio clip (up to the first 4 minutes).'
          : dmUsage(),
      }, { quoted: msg });
    }

    try {
      const sourceText = source?.conversation || source?.extendedTextMessage?.text;
      if (!source || sourceText) {
        const text = input || sourceText;
        if (!text) throw new Error('No text was found');
        const result = await publishEverywhere(sock, targetJid, { text });
        return sock.sendMessage(jid, { text: publishSummary(result, inGroup ? null : targetName) }, { quoted: msg });
      }

      const content = await module.exports.prepareStatusContent(sock, msg, ctx, source, replied, input);
      if (!content) {
        return sock.sendMessage(jid, { text: '✦ CELESTIA supports text, music, images, videos and stickers for Status.' }, { quoted: msg });
      }
      const result = await publishEverywhere(sock, targetJid, content);
      return sock.sendMessage(jid, { text: publishSummary(result, inGroup ? null : targetName) }, { quoted: msg });
    } catch (error) {
      console.error('[GROUPPOST ERROR]', error);
      return sock.sendMessage(jid, { text: `✦ CELESTIA could not publish this Status: ${error.message}` }, { quoted: msg });
    }
  },
  sendGroupStatus,
  sendPersonalStatus,
  getPersonalStatusRecipients,
  publishEverywhere,
  resolveTargetGroup,
  downloadSourceMedia,
  prepareStatusContent,
  prepareStatusAudio,
};
