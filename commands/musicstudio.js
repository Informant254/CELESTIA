const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { ffmpegPath, runOnce } = require('../download/engines');
const { ffprobePath } = require('../download/engines');
const { jobDir, wipeDir } = require('../download/cleanup');

const PRESETS = Object.freeze({
  bass: 'bass=g=10:f=110:w=0.6,loudnorm=I=-16:TP=-1.5:LRA=9',
  echo: 'aecho=0.8:0.75:90|180:0.35|0.18,loudnorm=I=-16:TP=-1.5:LRA=9',
  slow: 'atempo=0.82,loudnorm=I=-16:TP=-1.5:LRA=9',
  fast: 'atempo=1.22,loudnorm=I=-16:TP=-1.5:LRA=9',
  nightcore: 'asetrate=44100*1.18,aresample=44100,atempo=0.847,loudnorm=I=-16:TP=-1.5:LRA=9',
  reverse: 'areverse,loudnorm=I=-16:TP=-1.5:LRA=9',
  robot: 'afftfilt=real=\u0027re*cos(0.12)-im*sin(0.12)\u0027:imag=\u0027re*sin(0.12)+im*cos(0.12)\u0027,loudnorm=I=-16:TP=-1.5:LRA=9',
  normalize: 'loudnorm=I=-16:TP=-1.5:LRA=9',
  reverb: 'aecho=0.8:0.65:45|90|180:0.28|0.18|0.1,loudnorm=I=-16:TP=-1.5:LRA=9',
  deep: 'asetrate=44100*0.88,aresample=44100,atempo=1.136,loudnorm=I=-16:TP=-1.5:LRA=9',
  clean: 'highpass=f=80,afftdn=nf=-25,lowpass=f=12000,loudnorm=I=-16:TP=-1.5:LRA=7',
  karaoke: 'aformat=channel_layouts=stereo,pan=stereo|c0=c0-c1|c1=c1-c0,loudnorm=I=-16:TP=-1.5:LRA=9',
});

async function duration(file) {
  const raw = await runOnce(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], 30000);
  return Number(String(raw).trim()) || 0;
}

module.exports = {
  name: 'musicstudio',
  aliases: ['studio', 'studiofx', 'audiofx'],
  description: 'Apply studio effects to replied audio/video: bass, echo, slow, fast, nightcore, reverse, robot, normalize, reverb, deep, clean, karaoke',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const preset = String(args[0] || '').toLowerCase();
    if (!PRESETS[preset]) {
      return sock.sendMessage(jid, { text: '🎚️ *CELESTIA MUSIC STUDIO*\n\nReply to audio/video with:\n`.studio bass|echo|slow|fast|nightcore|reverse|robot|normalize|reverb|deep|clean|karaoke`\n\n`clean` reduces noise. `karaoke` removes centered vocals when the mix allows it.' }, { quoted: msg });
    }
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    if (!quoted?.audioMessage && !quoted?.videoMessage) {
      return sock.sendMessage(jid, { text: '❌ Reply to an audio or video message with the effect you want.' }, { quoted: msg });
    }
    const declared = Number((quoted.audioMessage || quoted.videoMessage)?.fileLength || 0);
    if (declared > 32 * 1024 * 1024) return sock.sendMessage(jid, { text: '❌ Studio input must be under 32MB.' }, { quoted: msg });

    const dir = jobDir('music-studio');
    const input = path.join(dir, quoted.videoMessage ? 'input.mp4' : 'input.audio');
    const output = path.join(dir, `celestia-${preset}.mp3`);
    try {
      await sock.sendMessage(jid, { text: `🎛️ Applying *${preset}* in Celestia Music Studio...` }, { quoted: msg });
      const media = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
      );
      if (media.length > 32 * 1024 * 1024) throw new Error('Studio input exceeds 32MB');
      fs.writeFileSync(input, media);
      const seconds = await duration(input);
      const limit = preset === 'reverse' ? 180 : 600;
      if (!seconds || seconds > limit) throw new Error(`${preset} supports audio up to ${limit / 60} minutes`);
      await runOnce(ffmpegPath(), ['-y', '-i', input, '-vn', '-af', PRESETS[preset], '-c:a', 'libmp3lame', '-b:a', '160k', output], 300000);
      const result = fs.readFileSync(output);
      if (!result.length || result.length > 32 * 1024 * 1024) throw new Error('Studio output is too large for WhatsApp');
      await sock.sendMessage(jid, { audio: result, mimetype: 'audio/mpeg', ptt: false, fileName: `celestia-${preset}.mp3` }, { quoted: msg });
    } catch (error) {
      console.error('[MUSIC STUDIO]', String(error.message).slice(0, 160));
      await sock.sendMessage(jid, { text: `❌ Music Studio failed: ${error.message}` }, { quoted: msg });
    } finally {
      wipeDir(dir);
    }
  },
  _internals: { PRESETS },
};
