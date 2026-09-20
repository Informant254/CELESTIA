const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const kit = require('../utils/stickerKit');

module.exports = {
  name: 'cutoutsticker', aliases: ['smartsticker', 'nobgsticker'], description: 'Remove a replied photo background and make a sticker',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.imageMessage) return sock.sendMessage(jid, { text: '✂️ Reply to a clear photo with `.cutoutsticker`.' }, { quoted: msg });
    if (Number(quoted.imageMessage.fileLength || 0) > kit.MAX_INPUT) return sock.sendMessage(jid, { text: '❌ Photo must be under 20MB.' }, { quoted: msg });
    try {
      await sock.sendMessage(jid, { text: '✂️ Finding the subject and cutting the background...' }, { quoted: msg });
      const image = await downloadMediaMessage({ message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      let cutout = image;
      let removed = true;
      try { cutout = await kit.removeBackground(image); } catch { removed = false; }
      const sticker = await kit.toSticker(cutout, { pack: removed ? 'CELESTIA CUTOUTS' : 'CELESTIA PHOTOS', author: msg.pushName || 'CELESTIA', categories: ['✂️', '✨'] });
      await sock.sendMessage(jid, { sticker }, { quoted: msg });
      if (!removed) await sock.sendMessage(jid, { text: '⚠️ Background service was busy, so I created a clean photo sticker instead.' }, { quoted: msg });
    } catch (error) {
      await sock.sendMessage(jid, { text: `❌ Cutout sticker failed: ${String(error.message).slice(0, 140)}` }, { quoted: msg });
    }
  },
};
