const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const { contextInfo } = require('../utils/jidResolver');
const { groupStatusJids } = require('../utils/mediaStudio');

module.exports = {
  name: 'grouppost',
  aliases: ['gpoststatus', 'groupstory'],
  description: 'Post a WhatsApp Status for members of the current group (owner only).',
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
    const quoted = ctx?.quotedMessage;
    if (!quoted && !input) {
      return sock.sendMessage(jid, {
        text: 'Usage: `.grouppost <text>` or reply to text/image/video/audio/sticker with `.grouppost [caption]`.',
      }, { quoted: msg });
    }

    try {
      const metadata = await sock.groupMetadata(jid);
      const audience = await groupStatusJids(sock, jid, metadata);
      if (!audience.resolved) {
        return sock.sendMessage(jid, {
          text: 'I could not resolve any group member phone identities for Status delivery yet.',
        }, { quoted: msg });
      }

      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
      if (!quoted || quotedText) {
        await sock.sendMessage('status@broadcast', {
          text: input || quotedText,
        }, {
          backgroundColor: '#075E54',
          font: 1,
          statusJidList: audience.jids,
        });
      } else {
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
        let content;
        if (mediaType === 'imageMessage') content = { image: buffer, caption };
        if (mediaType === 'videoMessage') content = { video: buffer, caption };
        if (mediaType === 'audioMessage') content = { audio: buffer, mimetype: quoted.audioMessage?.mimetype || 'audio/mp4' };
        if (mediaType === 'stickerMessage') content = { sticker: buffer };
        await sock.sendMessage('status@broadcast', content, { statusJidList: audience.jids });
      }

      const skipped = audience.skipped ? ` ${audience.skipped} LID-only member(s) could not be resolved yet.` : '';
      return sock.sendMessage(jid, {
        text: `Status posted for ${audience.resolved} group member(s).${skipped}`,
      }, { quoted: msg });
    } catch (error) {
      return sock.sendMessage(jid, { text: `Failed to post group Status: ${error.message}` }, { quoted: msg });
    }
  },
};
