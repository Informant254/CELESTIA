const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { ffmpegPath, runOnce } = require('../download/engines');
const { jobDir, wipeDir } = require('../download/cleanup');
const studio = require('../utils/mediaStudio');

module.exports = {
  name: 'audiopro', aliases: ['apro', 'masteraudio'], description: 'Master audio or create a portrait waveform video',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const mode = (args[0] || '').toLowerCase();
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!['master', 'waveform', 'masterwave'].includes(mode) || (!quoted?.audioMessage && !quoted?.videoMessage)) {
      return sock.sendMessage(jid, { text: '🎧 *AUDIO PRO*\nReply to audio/video with:\n`.audiopro master`\n`.audiopro waveform <title>`\n`.audiopro masterwave <title>`' }, { quoted: msg });
    }
    const dir = jobDir('audio-pro');
    const input = path.join(dir, quoted.videoMessage ? 'input.mp4' : 'input.audio');
    const mastered = path.join(dir, 'celestia-master.mp3');
    try {
      const media = await downloadMediaMessage({ message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } }, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
      if (media.length > 32 * 1024 * 1024) throw new Error('Input must be under 32MB');
      fs.writeFileSync(input, media);
      await sock.sendMessage(jid, { text: '🎚️ Polishing the audio...' }, { quoted: msg });
      if (mode !== 'waveform') await runOnce(ffmpegPath(), ['-y', '-i', input, '-vn', '-af', 'highpass=f=35,afftdn=nf=-28,loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.94', '-c:a', 'libmp3lame', '-b:a', '128k', mastered], 300000);
      if (mode === 'master') return sock.sendMessage(jid, { audio: fs.readFileSync(mastered), mimetype: 'audio/mpeg', fileName: 'celestia-master.mp3', ptt: false }, { quoted: msg });
      const cover = path.join(dir, 'cover.jpg');
      const output = path.join(dir, 'celestia-waveform.mp4');
      await studio.createCard({ text: args.slice(1).join(' ') || 'CELESTIA AUDIO', author: mode === 'masterwave' ? 'MASTERED' : 'NOW PLAYING', output: cover });
      await studio.createWaveform({ input: mode === 'masterwave' ? mastered : input, cover, output });
      return sock.sendMessage(jid, { video: { url: output }, caption: '✦ CELESTIA Audio Pro' }, { quoted: msg });
    } catch (error) {
      return sock.sendMessage(jid, { text: `❌ Audio Pro: ${error.message}` }, { quoted: msg });
    } finally { wipeDir(dir); }
  },
};
