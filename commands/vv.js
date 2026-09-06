/**
 * .vv — manual view-once capture (the classic, now vaulted)
 *
 * Reply to any view-once with .vv → open media right here in chat
 * AND vaulted + DM'd to owner.
 */
const vault = require('../utils/viewonceVault');
const { isOwner } = require('../utils/isOwner');

module.exports = {
  name: 'vv',
  description: '🔓 Capture a view-once — reply to it with .vv (also auto-vaults)',
  async execute(sock, msg, args, commands, reply) {
    const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted) {
      return reply('🔓 Reply to a view-once photo/video/audio with *.vv*');
    }

    const found = vault.findViewOnce(quoted);
    if (!found) {
      return reply('🔓 That message isn\'t view-once. (Note: she auto-captures anyway when you reply — check `.vault`)');
    }

    // capture to vault + DM
    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, message: quoted },
        'buffer', {}
      );
      const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
      const payload = { [keyMap[found.type]]: buffer };
      if (found.type === 'video') payload.mimetype = 'video/mp4';
      if (found.type === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
      payload.caption = '🔓 *Captured by CELESTIA* — view-once is a suggestion, not a law. 🐺';
      await sock.sendMessage(jid, payload, { quoted: msg });

      // also vault + DM
      if (isOwner(msg)) {
        const ownerJid = require('../config/config').ownerNumber + '@s.whatsapp.net';
        const senderJid = ctx.participantPn || ctx.participant || jid;
        vault.captureToVault(sock, quoted, { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }, senderJid, ownerJid)
          .catch(() => {});
      }
    } catch (e) {
      return reply(`🔓 Capture failed: ${e.message}\n\n_Tip: reply quickly — media expires server-side._`);
    }
  },
};
