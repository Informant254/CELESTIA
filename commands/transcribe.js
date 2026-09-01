const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

ffmpeg.setFfmpegPath(ffmpegPath);

const GOOGLE_KEY = process.env.GOOGLE_STT_KEY || 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

module.exports = {
  name: 'transcribe',
  aliases: ['speech2text', 'audio2text', 'whisper'],
  description: 'Transcribe quoted audio or video to text',

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
        { text: '📌 Reply to an audio or video message to transcribe it.' },
        { quoted: msg }
      );
    }

    const thinkingMsg = await sock.sendMessage(jid, { text: '🎙️ *Transcribing audio...*' }, { quoted: msg });

    let rawPath, flacPath;
    try {
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: jid, id: ctx.stanzaId, fromMe: false, participant: ctx.participant }, message: quoted },
        'buffer',
        {},
        { reuploadRequest: sock.updateMediaMessage }
      );

      rawPath = path.join(os.tmpdir(), `transcribe_raw_${Date.now()}`);
      fs.writeFileSync(rawPath, buffer);

      flacPath = path.join(os.tmpdir(), `transcribe_${Date.now()}.flac`);
      await new Promise((resolve, reject) => {
        ffmpeg(rawPath)
          .audioChannels(1)
          .audioFrequency(16000)
          .toFormat('flac')
          .on('end', resolve)
          .on('error', reject)
          .save(flacPath);
      });

      const flacBuffer = fs.readFileSync(flacPath);
      const res = await axios.post(
        `https://www.google.com/speech-api/v2/recognize?output=json&lang=en-US&key=${GOOGLE_KEY}`,
        flacBuffer,
        {
          headers: { 'Content-Type': 'audio/x-flac; rate=16000' },
          timeout: 30000,
        }
      );

      const lines = String(res.data).trim().split('\n').filter(l => l.trim() && l !== '{}');
      let transcript = '';
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const alt = obj?.result?.[0]?.alternative?.[0]?.transcript;
          if (alt) transcript += alt + ' ';
        } catch (_) {}
      }

      transcript = transcript.trim();
      if (!transcript) {
        throw new Error('Could not make out any speech. Audio may be too short or unclear.');
      }

      await sock.sendMessage(
        jid,
        { text: `📝 *Transcription*\n\n${transcript}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[TRANSCRIBE ERROR]', err.message);
      await sock.sendMessage(
        jid,
        { text: `❌ Failed to transcribe: ${err.message}`, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } finally {
      for (const p of [rawPath, flacPath]) {
        if (p && fs.existsSync(p)) {
          try { fs.unlinkSync(p); } catch (_) {}
        }
      }
    }
  },
};

