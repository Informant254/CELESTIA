const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const googleTTS = require('google-tts-api');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { ffmpegPath, runOnce } = require('../download/engines');
const { jobDir, wipeDir } = require('../download/cleanup');
const settingsStore = require('./settingsStore');

function sttKey() {
  return process.env.GOOGLE_STT_KEY || null;
}

function pollinationsKey() {
  return settingsStore.get('pollinations_key', null) || process.env.POLLINATIONS_KEY || null;
}

function canTranscribe() {
  return !!(pollinationsKey() || sttKey());
}

function parseTranscript(data) {
  let transcript = '';
  for (const line of String(data || '').split('\n')) {
    if (!line.trim() || line.trim() === '{}') continue;
    try {
      const text = JSON.parse(line)?.result?.[0]?.alternative?.[0]?.transcript;
      if (text) transcript += `${text} `;
    } catch {}
  }
  return transcript.trim();
}

async function transcribeMessage(sock, msg, language = 'en-US') {
  if (!canTranscribe()) throw Object.assign(new Error('Speech transcription is not configured'), { code: 'STT_UNAVAILABLE' });
  const content = require('@whiskeysockets/baileys').normalizeMessageContent(msg.message) || msg.message;
  if (!content?.audioMessage) throw new Error('Message is not audio');
  if (Number(content.audioMessage.fileLength || 0) > 16 * 1024 * 1024) throw new Error('Voice note is too large');

  const dir = jobDir('voice-stt');
  const input = path.join(dir, 'input.audio');
  const mp3 = path.join(dir, 'speech.mp3');
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
    fs.writeFileSync(input, buffer);
    await runOnce(ffmpegPath(), ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-t', '90', '-c:a', 'libmp3lame', '-b:a', '48k', mp3], 120000);
    if (pollinationsKey()) {
      try {
        const form = new FormData();
        form.append('file', fs.createReadStream(mp3), { filename: 'voice.mp3', contentType: 'audio/mpeg' });
        form.append('model', 'openai/whisper-large-v3');
        const response = await axios.post('https://gen.pollinations.ai/v1/audio/transcriptions', form, {
          headers: { ...form.getHeaders(), Authorization: `Bearer ${pollinationsKey()}` },
          timeout: 90000,
          maxContentLength: 20 * 1024 * 1024,
        });
        const text = String(response.data?.text || '').trim();
        if (text) return text;
      } catch (error) {
        if (!sttKey()) throw error;
        console.warn('[speech] Pollinations transcription failed; trying Google:', String(error.message).slice(0, 100));
      }
      if (!sttKey()) return '';
    }
    const flac = path.join(dir, 'speech.flac');
    await runOnce(ffmpegPath(), ['-y', '-i', mp3, '-ac', '1', '-ar', '16000', '-f', 'flac', flac], 120000);
    const response = await axios.post(`https://www.google.com/speech-api/v2/recognize?output=json&lang=${encodeURIComponent(language)}&key=${encodeURIComponent(sttKey())}`, fs.readFileSync(flac), {
      headers: { 'Content-Type': 'audio/x-flac; rate=16000' }, timeout: 45000,
    });
    return parseTranscript(response.data);
  } finally {
    wipeDir(dir);
  }
}

async function synthesizeVoice(text, language = 'en-US') {
  const clean = String(text || '').replace(/[*_~`>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!clean) throw new Error('No speech text');
  const dir = jobDir('voice-tts');
  const input = path.join(dir, 'speech.mp3');
  const output = path.join(dir, 'speech.ogg');
  try {
    const urls = googleTTS.getAllAudioUrls(clean, { lang: language, slow: false, host: 'https://translate.google.com', splitPunct: ',.?!' });
    const chunks = [];
    for (const item of urls) {
      const response = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 30000 });
      chunks.push(Buffer.from(response.data));
    }
    fs.writeFileSync(input, Buffer.concat(chunks));
    await runOnce(ffmpegPath(), ['-y', '-i', input, '-af', 'highpass=f=90,lowpass=f=9000,loudnorm=I=-18:TP=-2:LRA=7', '-c:a', 'libopus', '-application', 'voip', '-ac', '1', '-ar', '24000', '-b:a', '32k', output], 120000);
    return fs.readFileSync(output);
  } finally {
    wipeDir(dir);
  }
}

module.exports = { canTranscribe, parseTranscript, transcribeMessage, synthesizeVoice };
