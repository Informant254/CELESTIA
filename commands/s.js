const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const sharp = require("sharp");
const ffmpegPath = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';

module.exports = {
  name: "s",
  aliases: ["sticker"],
  description: "Convert an image or short video into a sticker.",
  category: "media",
  async execute(sock, msg) {
    try {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted) {
        return await sock.sendMessage(
          msg.key.remoteJid,
          { text: "❌ Reply to an image or short video." },
          { quoted: msg }
        );
      }

      let media, type;
      if (quoted.imageMessage) {
        media = quoted.imageMessage;
        type = "image";
      } else if (quoted.videoMessage) {
        media = quoted.videoMessage;
        if ((media.seconds || 0) > 10) {
          return await sock.sendMessage(
            msg.key.remoteJid,
            { text: "❌ Video must be 10 seconds or shorter." },
            { quoted: msg }
          );
        }
        type = "video";
      } else {
        return await sock.sendMessage(
          msg.key.remoteJid,
          { text: "❌ Reply to an image or short video." },
          { quoted: msg }
        );
      }

      const stream = await downloadContentFromMessage(media, type);
      let buffer = Buffer.alloc(0);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }

      const pushname = msg.pushName || 'No Name';
      let stickerBuffer;

      if (type === "image") {
        // Contain + pad to 512x512 with a transparent background first
        // (same framing as before) — then hand off to wa-sticker-formatter,
        // which embeds the pack/author watermark, matching take.js.
        const padded = await sharp(buffer)
          .resize(512, 512, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer();

        const sticker = new Sticker(padded, {
          pack: pushname,
          author: 'CELESTIA',
          type: StickerTypes.DEFAULT,
          quality: 100,
          background: 'transparent',
        });
        stickerBuffer = await sticker.toBuffer();
      } else {
        const input = path.join(__dirname, "../temp_input.mp4");
        const processed = path.join(__dirname, "../temp_processed.mp4");
        fs.writeFileSync(input, buffer);

        // Normalize with ffmpeg (scale/pad/fps) but stop at mp4 — let
        // wa-sticker-formatter do the final webp conversion so it can
        // embed the same watermark take.js uses.
        await new Promise((resolve, reject) => {
          exec(
            `"${ffmpegPath}" -y -i "${input}" -t 10 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0" -an -c:v libx264 -crf 28 -preset ultrafast "${processed}"`,
            (err) => (err ? reject(err) : resolve())
          );
        });

        const sticker = new Sticker(fs.readFileSync(processed), {
          pack: pushname,
          author: 'CELESTIA',
          type: StickerTypes.DEFAULT,
          quality: 50,
        });
        stickerBuffer = await sticker.toBuffer();

        try { fs.unlinkSync(input); } catch {}
        try { fs.unlinkSync(processed); } catch {}
      }

      await sock.sendMessage(
        msg.key.remoteJid,
        { sticker: stickerBuffer },
        { quoted: msg }
      );
    } catch (e) {
      console.error(e);
      await sock.sendMessage(
        msg.key.remoteJid,
        { text: "❌ Failed to create sticker." },
        { quoted: msg }
      );
    }
  }
};
