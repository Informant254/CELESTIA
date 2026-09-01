const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// Jimp v1.x exports the class as a NAMED export (`{ Jimp }`), while v0.x
// exported it as the default (`module.exports = Jimp`). Support both so
// this doesn't break again on the next `npm install`/version bump.
const jimpModule = require('jimp');
const Jimp = jimpModule.Jimp || jimpModule.default || jimpModule;

module.exports = {
  name: 'qr',
  description: 'Create a QR code from text, or read one from an image. Usage: .qr <text>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const text = args.join(' ');

    // Reading mode: replying to an image with .qr (no text supplied)
    if (quoted?.imageMessage && !text) {
      try {
        if (typeof Jimp?.read !== 'function') {
          throw new Error('Jimp.read is unavailable — check the installed jimp version (npm ls jimp).');
        }

        const media = await downloadMediaMessage(
          {
            message: quoted,
            key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant }
          },
          'buffer',
          {}
        );

        const image = await Jimp.read(media);
        const { data, width, height } = image.bitmap;
        const code = jsQR(new Uint8ClampedArray(data), width, height);

        if (!code) {
          return sock.sendMessage(jid, { text: '❌ No QR code found in that image.' }, { quoted: msg });
        }

        await sock.sendMessage(jid, { text: `📷 *QR Content:*\n${code.data}` }, { quoted: msg });
      } catch (e) {
        console.error('[QR READ ERROR]', e);
        await sock.sendMessage(jid, { text: '❌ Could not read QR code: ' + e.message }, { quoted: msg });
      }
      return;
    }

    // Generation mode
    if (!text) {
      return sock.sendMessage(jid, { text: '❌ Usage: .qr <text>\nOr reply to an image containing a QR code with .qr' }, { quoted: msg });
    }

    try {
      const buffer = await QRCode.toBuffer(text, { width: 512 });
      await sock.sendMessage(jid, { image: buffer, caption: `✅ QR code for: ${text}` }, { quoted: msg });
    } catch (e) {
      console.error('[QR GENERATE ERROR]', e);
      await sock.sendMessage(jid, { text: '❌ Could not generate QR code: ' + e.message }, { quoted: msg });
    }
  }
};

