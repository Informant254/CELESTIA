const axios = require('axios');
const FormData = require('form-data');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { KEITH_BASE } = require('../config/apis');

const API = KEITH_BASE;

async function uploadToCatbox(buffer, filename) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', buffer, { filename });
  const res = await axios.post('https://catbox.moe/user/api.php', form, { headers: form.getHeaders() });
  return res.data;
}

module.exports = {
  name: 'vocalremover',
  aliases: ['removevocal', 'aivocal', 'extractvocal'],
  description: 'Extract vocals from quoted audio or video',

  async execute(sock, msg) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    const audioMsg = quoted?.audioMessage;
    const videoMsg = quoted?.videoMessage;

    if (!audioMsg && !videoMsg) {
      return sock.sendMessage(
        jid,
        { text: '📌 Reply to an audio or video message to extract vocals.' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '🎵 *Extracting vocals...*' }, { quoted: msg });

    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      const ext = audioMsg ? 'mp3' : 'mp4';
      const mediaUrl = await uploadToCatbox(buffer, `media.${ext}`);

      const { data } = await axios.get(`${API}/ai/vocalremover?url=${encodeURIComponent(mediaUrl)}`, { timeout: 180000 });

      if (!data?.status || !data?.result?.vocal) {
        throw new Error('No vocal track found.');
      }

      await sock.sendMessage(
        jid,
        {
          audio: { url: data.result.vocal },
          mimetype: 'audio/mp4',
          ptt: false
        },
        { quoted: msg }
      );

      await sock.sendMessage(jid, { delete: thinkingMsg.key }).catch(() => {});
    } catch (err) {
      console.error('[VOCALREMOVER ERROR]', err);
      await sock.sendMessage(
        jid,
        { text: `❌ Failed to extract vocals: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};

