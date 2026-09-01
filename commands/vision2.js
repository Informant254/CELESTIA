const axios = require('axios');
const FormData = require('form-data');
const mime = require('mime-types');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

async function uploadToUguu(buffer, filename) {
  const mimeType = mime.lookup(filename) || 'image/jpeg';
  const form = new FormData();
  form.append('files[]', buffer, { filename, contentType: mimeType });

  const res = await axios.post('https://uguu.se/upload.php', form, {
    headers: {
      ...form.getHeaders(),
      origin: 'https://uguu.se',
      referer: 'https://uguu.se/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (res.data?.success && res.data?.files?.[0]?.url) {
    return res.data.files[0].url;
  }
  throw new Error('Media upload failed');
}

module.exports = {
  name: 'vision2',
  aliases: ['v2', 'analyze2', 'imgai2'],
  description: 'Analyze an image with AI (quote an image)',

  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const question = args.join(' ').trim();

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(
        jid,
        { text: '📌 Reply to an image message to analyze it.' },
        { quoted: msg }
      );
    }

    if (!question) {
      return await sock.sendMessage(
        jid,
        { text: '❌ Provide a question/instruction!\nExample: *.vision2 what is in this image?*' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: '🤖 *Analyzing your image...*' },
      { quoted: msg }
    );

    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      const imageUrl = await uploadToUguu(buffer, 'image.jpg');

      const res = await axios.get(
        `${KEITH_BASE}/ai/vision?image=${encodeURIComponent(imageUrl)}&q=${encodeURIComponent(question)}`,
        {
          timeout: 120000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
          }
        }
      );
      const result = res.data;

      if (!result?.status || !result?.result) {
        return await sock.sendMessage(
          jid,
          { text: '❌ No response from Vision AI. Try again.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      const responseText = typeof result.result === 'string'
        ? result.result
        : result.result.response || result.result.text || JSON.stringify(result.result);

      await sock.sendMessage(
        jid,
        { text: `👁️ *Vision Analysis*\n\n${responseText}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[VISION2 ERROR]', error);
      await sock.sendMessage(
        jid,
        { text: `❌ Failed to analyze image: ${error.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};

