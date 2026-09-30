const fs = require('fs');
const os = require('os');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { ensureFfmpegPath, runOnce } = require('../download/engines');
// Native/optional modules load lazily inside execute() so a failed
// install on the host can never crash the whole bot at boot.

module.exports = {
  name: 'tovideo',
  aliases: ['mp4', 'tovid'],
  description: 'Convert a quoted animated sticker to video. Reply to an animated sticker with .tovideo',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    let sharp;
    try {
      sharp = require('sharp');
    } catch {
      return sock.sendMessage(jid, { text: `❌ Video engine unavailable on this host (media module failed to install).` }, { quoted: msg });
    }
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.stickerMessage) {
      return sock.sendMessage(jid, { text: `📎 Reply to an *animated sticker* with *.tovideo*` }, { quoted: msg });
    }

    const mimetype = quoted.stickerMessage.mimetype || '';
    if (!/webp/.test(mimetype)) {
      return sock.sendMessage(jid, { text: `⚠️ That's not a sticker.` }, { quoted: msg });
    }

    const id = Date.now();
    const tmpDir = os.tmpdir();
    const framesDir = path.join(tmpDir, `frames_${id}`);
    const outputPath = path.join(tmpDir, `video_${id}.mp4`);

    try {
      await sock.sendMessage(jid, { text: '🎬 _Converting sticker to video..._' }, { quoted: msg });

      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer',
        {}
      );

      await fs.promises.mkdir(framesDir, { recursive: true });

      const image = sharp(buffer, { animated: true });
      const metadata = await image.metadata();
      const pages = metadata.pages || 1;

      if (pages <= 1) {
        return sock.sendMessage(jid, { text: '⚠️ This is a *static* sticker, not animated!' }, { quoted: msg });
      }

      for (let i = 0; i < pages; i++) {
        const frameBuf = await sharp(buffer, { animated: false, page: i }).png().toBuffer();
        const framePath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
        await fs.promises.writeFile(framePath, frameBuf);
      }

      try {
        await runOnce(await ensureFfmpegPath(), [
          '-y', '-framerate', '15', '-i', path.join(framesDir, 'frame_%04d.png'),
          '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p',
          '-movflags', 'faststart', outputPath,
        ], 60000);
      } catch (e) {
        return sock.sendMessage(jid, { text: '❌ ffmpeg error: ' + e.message }, { quoted: msg });
      }

      try {
        await fs.promises.access(outputPath);
      } catch {
        return sock.sendMessage(jid, { text: '❌ Output file not created' }, { quoted: msg });
      }

      const videoBuffer = await fs.promises.readFile(outputPath);
      await sock.sendMessage(jid, {
        video: videoBuffer,
        caption: '*Sticker converted successfully to Video*'
      }, { quoted: msg });

    } catch (err) {
      console.error('[TOVIDEO ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error: ' + err.message }, { quoted: msg });
    } finally {
      await Promise.allSettled([
        fs.promises.rm(framesDir, { recursive: true, force: true }),
        fs.promises.unlink(outputPath),
      ]);
    }
  },
};

