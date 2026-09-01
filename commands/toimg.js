const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'toimg',
  aliases: ['photo', 'toimage'],
  description: 'Convert a sticker to an image. Reply to a sticker with .toimg',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.stickerMessage) {
      return sock.sendMessage(jid, { text: 'Reply to a sticker with *.toimg*' }, { quoted: msg });
    }

    const mimetype = quoted.stickerMessage.mimetype || '';
    if (!/webp/.test(mimetype)) {
      return sock.sendMessage(jid, { text: 'Tag a sticker to convert to photo' }, { quoted: msg });
    }

    const id = Date.now();
    const inputPath = path.join(os.tmpdir(), `toimg_${id}.webp`);
    const outputPath = path.join(os.tmpdir(), `toimg_${id}.png`);

    try {
      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer',
        {}
      );
      fs.writeFileSync(inputPath, buffer);

      // execFile (not exec) — no shell string interpolation of file paths.
      await new Promise((resolve, reject) => {
        execFile(ffmpegPath, ['-y', '-i', inputPath, outputPath], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      if (!fs.existsSync(outputPath)) throw new Error('Output file not created');

      const outBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(jid, { image: outBuffer, caption: '✅ *Converted successfully!*' }, { quoted: msg });

    } catch (err) {
      console.error('[TOIMG ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Conversion failed.' }, { quoted: msg });
    } finally {
      for (const p of [inputPath, outputPath]) {
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
      }
    }
  },
};

