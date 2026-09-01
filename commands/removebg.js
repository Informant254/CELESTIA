const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');

module.exports = {
  name: 'removebg',
  aliases: ['rmbg', 'bgremove', 'nobg'],
  description: 'Remove background from a quoted image',

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted?.imageMessage) {
      return await sock.sendMessage(jid, { text: '🖼️ Reply to an image with *.removebg* to remove its background.' }, { quoted: msg });
    }

    let filePath;

    try {
      await sock.sendMessage(jid, { text: '🧼 Removing background...' }, { quoted: msg });

      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      filePath = path.join(os.tmpdir(), `removebg_${Date.now()}.jpg`);
      fs.writeFileSync(filePath, buffer);

      // Step 1: create job
      const formData = new FormData();
      formData.append('image_file', fs.createReadStream(filePath));
      formData.append('turnstile_token', '');

      const createRes = await axios.post(
        'https://api.ezremove.ai/api/ez-remove/background-remove/create-job-v2',
        formData,
        {
          headers: {
            'product-serial': '07cc2e862644a6a1860194a9f6a6f70f',
            ...formData.getHeaders(),
          },
          timeout: 30000,
        }
      );

      const jobId = createRes.data?.result?.job_id;
      if (!jobId) {
        return await sock.sendMessage(jid, { text: '❌ Failed to create removebg job.' }, { quoted: msg });
      }

      // Step 2: poll job result
      let outputUrl;
      for (let i = 0; i < 10; i++) {
        const getRes = await axios.get(
          `https://api.ezremove.ai/api/ez-remove/background-remove/get-job/${jobId}`
        );
        outputUrl = getRes.data?.result?.output?.[0];
        if (outputUrl) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!outputUrl) {
        return await sock.sendMessage(jid, { text: '⚠️ Background removal not ready. Try again shortly.' }, { quoted: msg });
      }

      // Step 3: send result image
      await sock.sendMessage(jid, {
        image: { url: outputUrl },
        caption: '✅ Background removed',
      }, { quoted: msg });

    } catch (error) {
      console.error('[REMOVEBG ERROR]', error);
      await sock.sendMessage(jid, { text: '❌ Failed to remove background. Try a different image.' }, { quoted: msg });
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  },
};
