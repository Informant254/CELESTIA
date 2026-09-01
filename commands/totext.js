const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

ffmpeg.setFfmpegPath(ffmpegPath);

// Shared/public key from the original snippet — kept as a fallback, but set
// GOOGLE_STT_KEY in your .env with your own if this one gets rate-limited
// or revoked (it's reused across many public bots).
const GOOGLE_KEY = process.env.GOOGLE_STT_KEY || 'AIzaSyBOti4mM-6x9WDnZIjIeyEU21OpBXqWBgw';

module.exports = {
  name: 'totext',
  aliases: ['stt', 'listen', 'scribe', 'audiotxt'],
  description: 'Convert a quoted voice/audio message to text. Reply to a voice note with .totext',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;

    if (!quoted) {
      return sock.sendMessage(jid, { text: '🎙️ Reply to a voice note or audio message with *.totext*' }, { quoted: msg });
    }

    const audioMessage = quoted.audioMessage || quoted.videoMessage || null;
    if (!audioMessage) {
      return sock.sendMessage(jid, { text: '❌ Quoted message is not audio. Reply to a voice note.' }, { quoted: msg });
    }

    let rawPath, flacPath;
    try {
      await sock.sendMessage(jid, { text: '⏳ Converting audio to text...' }, { quoted: msg });

      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer',
        {}
      );

      rawPath = path.join(os.tmpdir(), `stt_raw_${Date.now()}`);
      fs.writeFileSync(rawPath, buffer);

      flacPath = path.join(os.tmpdir(), `stt_${Date.now()}.flac`);
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
        return sock.sendMessage(jid, { text: '🤷 Could not make out any speech. Try a clearer audio message.' }, { quoted: msg });
      }

      await sock.sendMessage(jid, { text: `🎙️ *Transcription:*\n\n${transcript}` }, { quoted: msg });

    } catch (err) {
      console.error('[TOTEXT ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Transcription failed. Audio may be too long (max ~60s) or too noisy.' }, { quoted: msg });
    } finally {
      for (const p of [rawPath, flacPath]) {
        if (p && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (_) {} }
      }
    }
  },
};

