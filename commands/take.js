module.exports = {
  name: 'take',
  aliases: ['steal'],
  description: 'Retake/rewatermark a sticker, image, or short video as an CELESTIA sticker.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const { Sticker, StickerTypes } = require('wa-sticker-formatter');
    const sharp = require('sharp');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const pushname = msg.pushName || 'No Name';

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted) {
      return sock.sendMessage(jid, { text: '❌ Quote an image, a short video, or a sticker to change the watermark.' }, { quoted: msg });
    }

    let media;
    let isVideo = false;
    let isAnimatedSticker = false;

    if (quoted.imageMessage) {
      media = quoted.imageMessage;
    } else if (quoted.videoMessage) {
      media = quoted.videoMessage;
      isVideo = true;
    } else if (quoted.stickerMessage) {
      media = quoted.stickerMessage;
      isAnimatedSticker = !!quoted.stickerMessage.isAnimated;
    } else {
      return sock.sendMessage(jid, { text: '❌ This is neither a sticker, image, nor a video.' }, { quoted: msg });
    }

    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
    const quotedKey = { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant, fromMe: false };
    const buffer = await downloadMediaMessage({ message: quoted, key: quotedKey }, 'buffer', {});

    const inputPath = path.join(os.tmpdir(), `take_in_${Date.now()}`);
    fs.writeFileSync(inputPath, buffer);

    try {
      let buf;

      if (isVideo) {
        const { execSync } = require('child_process');
        let ffmpegPath;
        try { ffmpegPath = require('ffmpeg-static'); } catch { ffmpegPath = 'ffmpeg'; }

        const id = Date.now();
        const tmpDir = os.tmpdir();

        const makeSticker = async (fps, q) => {
          const processedPath = path.join(tmpDir, `take_${id}_${fps}fps.mp4`);
          try {
            execSync(
              `"${ffmpegPath}" -y -i "${inputPath}" -t 6 ` +
              `-vf "scale=512:512:force_original_aspect_ratio=decrease,fps=${fps},` +
              `pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0" ` +
              `-an -c:v libx264 -crf 28 -preset ultrafast "${processedPath}"`,
              { timeout: 30000, stdio: 'pipe' }
            );
          } catch (e) {
            fs.copyFileSync(inputPath, processedPath);
          }
          const sticker = new Sticker(fs.readFileSync(processedPath), {
            pack: pushname,
            author: 'CELESTIA',
            type: StickerTypes.DEFAULT,
            quality: q,
          });
          const out = await sticker.toBuffer();
          try { fs.unlinkSync(processedPath); } catch {}
          return out;
        };

        buf = await makeSticker(10, 40);
        if (!buf || buf.length < 500) {
          return sock.sendMessage(jid, { text: '❌ Video sticker failed — ffmpeg may be unavailable on this server.' }, { quoted: msg });
        }

        if (buf.length > 950 * 1024) {
          const retryBuf = await makeSticker(5, 25);
          if (retryBuf && retryBuf.length >= 500) buf = retryBuf;
        }

        if (buf.length > 1024 * 1024) {
          return sock.sendMessage(
            jid,
            { text: `❌ Sticker still too large (${(buf.length / 1024 / 1024).toFixed(2)} MB) after compression.\n💡 Tip: Try a shorter clip (< 4s) or send an image instead.` },
            { quoted: msg }
          );
        }

      } else if (isAnimatedSticker) {
        const sticker = new Sticker(buffer, {
          pack: pushname,
          author: 'CELESTIA',
          type: StickerTypes.FULL,
          quality: 70,
        });
        buf = await sticker.toBuffer();

        if (!buf || buf.length < 500) {
          return sock.sendMessage(jid, { text: '❌ Failed to re-pack animated sticker.' }, { quoted: msg });
        }

        if (buf.length > 1024 * 1024) {
          return sock.sendMessage(
            jid,
            { text: `❌ Animated sticker too large (${(buf.length / 1024 / 1024).toFixed(2)} MB).\n💡 Tip: WhatsApp stickers must be under 1 MB.` },
            { quoted: msg }
          );
        }

      } else {
        // Image & Static Sticker Processing using Sharp
        const processedImageBuffer = await sharp(buffer)
          .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();

        const sticker = new Sticker(processedImageBuffer, {
          pack: pushname,
          author: 'CELESTIA',
          type: StickerTypes.DEFAULT,
          categories: ['🤩', '🎉'],
          quality: 100,
          background: 'transparent',
        });
        buf = await sticker.toBuffer();
      }

      await sock.sendMessage(jid, { sticker: buf }, { quoted: msg });
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Error: ' + e.message }, { quoted: msg });
    } finally {
      try { fs.unlinkSync(inputPath); } catch {}
    }
  },
};

