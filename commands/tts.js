const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const googleTTS = require('google-tts-api');

const ffmpegPath = process.env.FFMPEG_PATH || require('ffmpeg-static') || 'ffmpeg';
const execFileAsync = promisify(execFile);

module.exports = {
  name: 'tts',
  aliases: ['say'],
  description: 'Convert text to speech',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
      return await sock.sendMessage(jid, { text: 'Provide text for conversion!' }, { quoted: msg });
    }

    const url = googleTTS.getAudioUrl(text, {
      lang: 'en-US',
      slow: false,
      host: 'https://translate.google.com',
    });

    let tmpMp3;
    let tmpOgg;

    try {
      const tmpDir = os.tmpdir();
      tmpMp3 = path.join(tmpDir, `tts_${Date.now()}.mp3`);
      tmpOgg = path.join(tmpDir, `tts_${Date.now()}.ogg`);

      const { data } = await axios.get(url, { responseType: 'arraybuffer' });
      fs.writeFileSync(tmpMp3, Buffer.from(data));

      await execFileAsync(ffmpegPath, [
        '-i', tmpMp3, '-c:a', 'libopus', '-ac', '1', '-ar', '16000', '-b:a', '32k', tmpOgg, '-y',
      ]);

      const oggBuf = fs.readFileSync(tmpOgg);

      await sock.sendMessage(
        jid,
        { audio: oggBuf, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: msg }
      );
    } catch (error) {
      console.error('[TTS ERROR]', error);
      await sock.sendMessage(
        jid,
        { audio: { url }, mimetype: 'audio/mpeg', ptt: false },
        { quoted: msg }
      );
    } finally {
      [tmpMp3, tmpOgg].forEach((f) => {
        if (f && fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch {}
        }
      });
    }
  },
};
