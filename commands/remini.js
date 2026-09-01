const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

async function uploadToUguu(filePath) {
  const form = new FormData();
  form.append('files[]', fs.createReadStream(filePath));

  const response = await axios.post('https://uguu.se/upload', form, {
    headers: form.getHeaders(),
    timeout: 30000,
  });

  const result = response.data;
  if (result?.success && result.files?.[0]?.url) {
    return result.files[0].url;
  }
  throw new Error('Uguu upload failed or malformed response');
}

module.exports = {
  name: 'remini',
  aliases: ['enhance', 'hd'],
  description: 'Enhance a quoted image using AI (Remini)',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(jid, { text: '📌 Reply to an image with *.remini* to enhance it.' }, { quoted: msg });
    }

    let filePath;

    try {
      await sock.sendMessage(jid, { text: '⏳ Enhancing your image with AI... Please wait.' }, { quoted: msg });

      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      filePath = path.join(os.tmpdir(), `remini_${Date.now()}.jpg`);
      fs.writeFileSync(filePath, buffer);

      const imageUrl = await uploadToUguu(filePath);

      const res = await axios.get(`https://apis.davidcyril.name.ng/remini?url=${encodeURIComponent(imageUrl)}`, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('image')) {
        return await sock.sendMessage(jid, { text: '❌ API did not return an image. Try again.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, {
        image: Buffer.from(res.data),
        mimetype: 'image/png',
        caption: '✨ *Image Upscaled To HD*\n_Powered by CELESTIA_',
      }, { quoted: msg });

    } catch (error) {
      console.error('[REMINI ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Failed to enhance image. Make sure you replied to a clear photo and try again.' }, { quoted: msg });
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
