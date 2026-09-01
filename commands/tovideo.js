const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const sharp = require('sharp');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'tovideo',
  aliases: ['mp4', 'tovid'],
  description: 'Convert a quoted animated sticker to video. Reply to an animated sticker with .tovideo',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
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

      fs.mkdirSync(framesDir, { recursive: true });

      const image = sharp(buffer, { animated: true });
      const metadata = await image.metadata();
      const pages = metadata.pages || 1;

      if (pages <= 1) {
        return sock.sendMessage(jid, { text: '⚠️ This is a *static* sticker, not animated!' }, { quoted: msg });
      }

      for (let i = 0; i < pages; i++) {
        const frameBuf = await sharp(buffer, { animated: false, page: i }).png().toBuffer();
        const framePath = path.join(framesDir, `frame_${String(i).padStart(4, '0')}.png`);
        fs.writeFileSync(framePath, frameBuf);
      }

      try {
        execSync(
          `"${ffmpegPath}" -y -framerate 15 -i "${framesDir}/frame_%04d.png" -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -pix_fmt yuv420p -movflags faststart "${outputPath}"`,
          { timeout: 60000, stdio: 'pipe' }
        );
      } catch (e) {
        return sock.sendMessage(jid, { text: '❌ ffmpeg error: ' + (e.stderr?.toString()?.slice(0, 200) || e.message) }, { quoted: msg });
      }

      if (!fs.existsSync(outputPath)) {
        return sock.sendMessage(jid, { text: '❌ Output file not created' }, { quoted: msg });
      }

      const videoBuffer = fs.readFileSync(outputPath);
      await sock.sendMessage(jid, {
        video: videoBuffer,
        caption: '*Sticker converted successfully to Video*'
      }, { quoted: msg });

    } catch (err) {
      console.error('[TOVIDEO ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error: ' + err.message }, { quoted: msg });
    } finally {
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch (_) {}
      try { fs.unlinkSync(outputPath); } catch (_) {}
    }
  },
};

