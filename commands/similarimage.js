const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: 'similarimage',
  aliases: ['reverse', 'similarimg', 'reverseimage', 'findimage'],
  description: 'Find similar images using reverse image search',

  async execute(sock, msg) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(
        jid,
        { text: '📌 Reply to an image with `.similarimage`' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(
      jid,
      { text: '🔎 Searching for similar images...' },
      { quoted: msg }
    );

    try {
      const mediaBuffer = await downloadMediaMessage(
        {
          message: quoted,
          key: {
            remoteJid: jid,
            id: ctx.stanzaId,
            participant: ctx.participant || msg.key.participant,
          },
        },
        'buffer',
        {}
      );

      if (!mediaBuffer) {
        return await sock.sendMessage(
          jid,
          { text: '❌ Failed to process image media.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      // Upload file to Uguu
      const form = new FormData();
      form.append('files[]', mediaBuffer, `search_${Date.now()}.jpg`);

      const uploadRes = await axios.post('https://uguu.se/upload.php', form, {
        headers: form.getHeaders(),
      });

      const uploadedUrl = uploadRes.data?.files?.[0]?.url;

      if (!uploadedUrl) {
        throw new Error('Failed to upload image to host provider.');
      }

      const apiUrl = `${KEITH_BASE}/search/reverseimage?url=${encodeURIComponent(uploadedUrl)}`;
      const response = await axios.get(apiUrl);

      if (!response.data?.status || !response.data?.result?.similarImages?.length) {
        return await sock.sendMessage(
          jid,
          { text: '❌ No similar images found.', edit: thinkingMsg.key },
          { quoted: msg }
        );
      }

      await sock.sendMessage(jid, { delete: thinkingMsg.key }).catch(() => {});

      const similarImages = response.data.result.similarImages.slice(0, 5);

      for (let i = 0; i < similarImages.length; i++) {
        const img = similarImages[i];
        const imageUrl = img.thumbnailUrl || img.url;

        if (imageUrl) {
          await sock.sendMessage(
            jid,
            {
              image: { url: imageUrl },
              caption: i === 0 ? `🔍 *Similar Images Found*\n📸 ${similarImages.length} results found` : undefined
            },
            { quoted: msg }
          );
        }
      }

    } catch (err) {
      console.error('[SIMILARIMAGE ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ Error: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  }
};

