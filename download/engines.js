/**
 * download/engines.js — resolves + bootstraps the media engines.
 *
 *  yt-dlp : runtime-bootstrapped official binary (GitHub releases, direct
 *           download URL — no API, no rate limit). Works on laptop AND on
 *           fresh Pterodactyl containers where npm postinstall magic fails.
 *  ffmpeg : ffmpeg-static npm package (already a dependency).
 *  ffprobe: ffprobe-static npm package.
 *  aria2c : optional — detected in PATH, used only when present.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const BIN_DIR = path.join(__dirname, 'bin');
const TMP_DIR = path.join(__dirname, '..', 'downloads', 'tmp');

const YTDLP_ASSET = { win32: 'yt-dlp.exe', linux: 'yt-dlp', darwin: 'yt-dlp_macos' }[process.platform] || 'yt-dlp';
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_ASSET}`;

function ytdlpPath() {
  return path.join(BIN_DIR, YTDLP_ASSET);
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CELESTIA-Bot/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return get(res.headers.location, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function runOnce(bin, args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim().slice(0, 200)));
      resolve((stdout || '').trim());
    });
  });
}

async function ensureYtDlp() {
  const bin = ytdlpPath();
  if (fs.existsSync(bin)) {
    try {
      await runOnce(bin, ['--version'], 20000);
      return bin; // present AND executes
    } catch {
      try { fs.unlinkSync(bin); } catch { /* re-download below */ }
    }
  }
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const tmp = bin + '.part';
  const buf = await get(YTDLP_URL);
  if (!buf || buf.length < 1024 * 1024) {
    throw new Error('yt-dlp download looked truncated — refusing to install.');
  }
  fs.writeFileSync(tmp, buf);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(tmp, 0o755); } catch { /* best effort */ }
  }
  fs.renameSync(tmp, bin);
  await runOnce(bin, ['--version'], 20000); // throws with clear error if broken
  return bin;
}

function ffmpegPath() {
  // Admin override: set FFMPEG_PATH to a system binary.
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  let p;
  try {
    p = require('ffmpeg-static');
  } catch {
    throw new Error('FFMPEG_MISSING: ffmpeg-static is not installed. Run: npm install ffmpeg-static');
  }
  if (!p || !fs.existsSync(p)) {
    throw new Error('FFMPEG_MISSING: ffmpeg binary not found. Reinstall with: npm install ffmpeg-static');
  }
  return p;
}

function ffprobePath() {
  // Admin override: set FFPROBE_PATH to a system binary.
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  let p;
  try {
    p = require('ffprobe-static').path;
  } catch {
    throw new Error('FFPROBE_MISSING: ffprobe-static is not installed. Run: npm install ffprobe-static');
  }
  if (!p || !fs.existsSync(p)) {
    throw new Error('FFPROBE_MISSING: ffprobe binary not found. Reinstall with: npm install ffprobe-static');
  }
  return p;
}

let aria2cCache = null;
async function aria2cPath() {
  if (aria2cCache !== null) return aria2cCache;
  try {
    await runOnce(process.platform === 'win32' ? 'aria2c.exe' : 'aria2c', ['--version'], 10000);
    aria2cCache = 'aria2c';
  } catch {
    aria2cCache = null; // optional — yt-dlp native downloader covers us
  }
  return aria2cCache;
}

function tmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  return TMP_DIR;
}

async function status() {
  const out = { ytdlp: null, ffmpeg: null, ffprobe: null, aria2c: null, storage: null };
  try {
    const bin = ytdlpPath();
    out.ytdlp = fs.existsSync(bin) ? await runOnce(bin, ['--version'], 15000) : null;
  } catch { out.ytdlp = null; }
  try { out.ffmpeg = (await runOnce(ffmpegPath(), ['-version'], 15000)).split('\n')[0]; } catch { out.ffmpeg = null; }
  try { out.ffprobe = (await runOnce(ffprobePath(), ['-version'], 15000)).split('\n')[0]; } catch { out.ffprobe = null; }
  out.aria2c = await aria2cPath();
  try {
    tmpDir();
    out.storage = true;
  } catch { out.storage = false; }
  return out;
}

module.exports = { ensureYtDlp, ytdlpPath, ffmpegPath, ffprobePath, aria2cPath, tmpDir, status, runOnce };
