const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

const OCR_API_KEY = process.env.OCR_API_KEY || 'helloworld';

module.exports = {
  name: 'ocr',
  aliases: ['readtext', 'extract', 'imgtotext', 'scan'],
  description: 'Extract text from a quoted image',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(jid, { text: '🖼️ Reply to an image with *.ocr* to read text from it.' }, { quoted: msg });
    }

    let filePath;

    try {
      await sock.sendMessage(jid, { text: '🔍 Scanning image for text...' }, { quoted: msg });

      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      filePath = path.join(os.tmpdir(), `ocr_${Date.now()}.jpg`);
      fs.writeFileSync(filePath, buffer);

      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('language', 'eng');
      form.append('isOverlayRequired', 'false');
      form.append('detectOrientation', 'true');
      form.append('scale', 'true');
      form.append('OCREngine', '2');

      const res = await axios.post('https://api.ocr.space/parse/image', form, {
        headers: { ...form.getHeaders(), apikey: OCR_API_KEY },
        timeout: 30000,
      });

      const data = res.data;

      if (data?.IsErroredOnProcessing) {
        return await sock.sendMessage(jid, { text: `❌ OCR error: ${data.ErrorMessage?.[0] || 'Unknown error'}` }, { quoted: msg });
      }

      const text = data?.ParsedResults?.[0]?.ParsedText?.trim();

      if (!text) {
        return await sock.sendMessage(jid, { text: '🤷 No text found in the image. Try a clearer photo.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      console.error('[OCR ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Failed to read text. Try a clearer, well-lit photo.' }, { quoted: msg });
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
