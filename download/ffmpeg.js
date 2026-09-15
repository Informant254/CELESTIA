/**
 * download/ffmpeg.js — merge / extract / convert / inspect via static binaries.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const { ffmpegPath, ffprobePath, runOnce } = require('./engines');

function probe(file) {
  const ffprobe = ffprobePath();
  return new Promise((resolve, reject) => {
    execFile(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=size,duration', '-of', 'json', file],
      { timeout: 30000 },
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

function toMp3(input, output) {
  const ffmpeg = ffmpegPath(); // throws admin diagnostic if missing
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-y', '-i', input, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', output],
      { timeout: 300000 },
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
    await runOnce(ffmpegPath(), ['-version'], 15000);
    await runOnce(ffprobePath(), ['-version'], 15000);
    return true;
  } catch (e) {
    throw new Error(
      'FFMPEG_MISSING: FFmpeg/FFprobe unavailable. Administrator: run `npm install ffmpeg-static ffprobe-static` and restart the bot.'
    );
  }
}

module.exports = { probe, toMp3, check };
