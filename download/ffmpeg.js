/**
 * download/ffmpeg.js — merge / extract / convert / inspect via static binaries.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ensureFfmpegPath, ensureFfprobePath, runOnce } = require('./engines');

async function probe(file, signal) {
  const ffprobe = await ensureFfprobePath();
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=size,duration', '-of', 'json', file],
      { timeout: 30000, signal },
      (err, stdout) => {
        if (err) return reject(new Error('Media inspection failed: ' + err.message.slice(0, 120)));
        try {
          const f = JSON.parse(stdout || '{}').format || {};
          resolve({ size: parseInt(f.size || '0', 10) || (fs.existsSync(file) ? fs.statSync(file).size : 0), duration: parseFloat(f.duration || '0') || null });
        } catch {
          resolve({ size: fs.existsSync(file) ? fs.statSync(file).size : 0, duration: null });
        }
      }
    );
  });
}

async function toMp3(input, output, signal) {
  const ffmpeg = await ensureFfmpegPath();
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-y', '-i', input, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', output],
      { timeout: 300000, signal },
      (err) => {
        if (err) return reject(new Error('Audio extraction failed: ' + String(err.message).slice(0, 150)));
        if (!fs.existsSync(output) || !fs.statSync(output).size) {
          return reject(new Error('Audio extraction produced no file.'));
        }
        resolve(output);
      }
    );
  });
}

async function check() {
  try {
    await ensureFfmpegPath();
    await ensureFfprobePath();
    return true;
  } catch (e) {
    throw new Error(
      'FFMPEG_MISSING: FFmpeg/FFprobe unavailable. Administrator: run `npm install ffmpeg-static ffprobe-static` and restart the bot.'
    );
  }
}

async function streams(file, signal) {
  const ffprobe = await ensureFfprobePath();
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe,
      ['-v', 'error', '-show_streams', '-of', 'json', file],
      { timeout: 30000, signal },
      (err, stdout) => {
        if (err) return reject(new Error('Stream inspection failed.'));
        try {
          resolve(JSON.parse(stdout || '{}').streams || []);
        } catch {
          reject(new Error('Stream inspection failed.'));
        }
      }
    );
  });
}

// Normalize any video to what phones + WhatsApp actually play:
// H.264 + AAC, yuv420p, faststart (moov up front for streaming).
// Already-friendly files get a seconds-long copy pass; others re-encode.
async function normalizeForWhatsApp(input, workDir, signal) {
  const ffmpeg = await ensureFfmpegPath();
  let friendly = false;
  try {
    const ss = await streams(input, signal);
    const v = ss.find((s) => s.codec_type === 'video');
    const a = ss.find((s) => s.codec_type === 'audio');
    friendly =
      !!v &&
      v.codec_name === 'h264' &&
      (!a || a.codec_name === 'aac') &&
      (!v.pix_fmt || v.pix_fmt === 'yuv420p');
  } catch {
    friendly = false;
  }
  const out = path.join(workDir, 'wa.mp4');
  const args = friendly
    ? ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', out]
    : ['-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
       '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out];
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { timeout: 600000, signal }, (err) => {
      if (err) return reject(new Error('Phone-format conversion failed: ' + String(err.message).slice(0, 150)));
      if (!fs.existsSync(out) || !fs.statSync(out).size) {
        return reject(new Error('Phone-format conversion produced no file.'));
      }
      resolve(out);
    });
  });
}

module.exports = { probe, toMp3, check, streams, normalizeForWhatsApp };
