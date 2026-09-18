const backend = require('../autochat/backend');

const OFFLINE_FALLBACK =
  '🎵 I cannot split vocals from audio in chat — that needs the actual audio file plus a stem-separation tool on a computer.\n\n' +
  'How to do it locally:\n' +
  '1. Save the audio (e.g. song.mp3) to your computer.\n' +
  '2. Install Demucs: `pip install demucs`\n' +
  '3. Run: `demucs song.mp3` (vocals land in `separated/htdemucs/song/vocals.wav`)\n' +
  'Alternative (ffmpeg karaoke-style center-cut, rough): `ffmpeg -i song.mp3 -af pan="stereo|c0=c0-c1|c1=c1-c0" instrumental.mp3`\n\n' +
  'If you tell me what the audio is for (karaoke, remix, lyrics), I can help with that part here.';

module.exports = {
  name: 'vocalremover',
  aliases: ['removevocal', 'aivocal', 'extractvocal'],
  description: 'Extract vocals from quoted audio or video',

  async execute(sock, msg, args) {
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
      // A chat LLM cannot separate audio stems. Be honest: explain + give local steps.
      // Still consult the backend so the reply can be tailored to any extra user note.
      const extra = (args || []).join(' ').trim();
      const res = await backend.complete(
        'You are an audio-engineering helper inside WhatsApp. You cannot process audio files here: no stem separation, no file output. Explain briefly that vocal removal needs the audio file plus a tool like Demucs/Spleeter or ffmpeg on a computer, then give concise local steps (Demucs install + command, plus the rough ffmpeg center-cut fallback). Never claim you processed or heard the audio. WhatsApp-friendly formatting, keep it practical.',
        extra
          ? `A user replied to an audio/video message asking for vocal removal. Extra note from them: "${extra}". Explain you cannot do the separation in chat and give the local steps.`
          : 'A user replied to an audio/video message asking for vocal removal. Explain you cannot do the separation in chat and give the local steps.'
      );

      const body = (res && res.text) ? res.text.trim() : OFFLINE_FALLBACK;

      await sock.sendMessage(
        jid,
        { text: body, edit: thinkingMsg.key },
        { quoted: msg }
      );
    } catch (err) {
      console.error('[VOCALREMOVER ERROR]', err.message);
      await sock.sendMessage(
        jid,
        { text: OFFLINE_FALLBACK, edit: thinkingMsg.key },
        { quoted: msg }
      );
    }
  },
};
