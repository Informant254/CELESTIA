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
const crypto = require('crypto');
const { execFile } = require('child_process');

const BIN_DIR = path.join(__dirname, 'bin');
const TMP_DIR = path.join(__dirname, '..', 'downloads', 'tmp');

const YTDLP_ASSET = { win32: 'yt-dlp.exe', linux: 'yt-dlp', darwin: 'yt-dlp_macos' }[process.platform] || 'yt-dlp';
const YTDLP_VERSION = '2026.08.19';
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${YTDLP_ASSET}`;
const YTDLP_SHA256 = {
  'yt-dlp.exe': '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a',
  'yt-dlp': '1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6',
  'yt-dlp_macos': '0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202',
};
let ensurePromise = null;

function ytdlpPath() {
  return path.join(BIN_DIR, YTDLP_ASSET);
}

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'CELESTIA-Bot/2.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return get(new URL(res.headers.location, url).toString(), redirects - 1).then(resolve, reject);
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

async function installYtDlp() {
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
  const digest = crypto.createHash('sha256').update(buf).digest('hex');
  if (digest !== YTDLP_SHA256[YTDLP_ASSET]) {
    throw new Error(`yt-dlp ${YTDLP_VERSION} failed SHA-256 verification.`);
  }
  fs.writeFileSync(tmp, buf);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(tmp, 0o755); } catch { /* best effort */ }
  }
  fs.renameSync(tmp, bin);
  await runOnce(bin, ['--version'], 20000); // throws with clear error if broken
  return bin;
}

function ensureYtDlp() {
  if (!ensurePromise) {
    ensurePromise = installYtDlp().finally(() => { ensurePromise = null; });
  }
  return ensurePromise;
}

function ffmpegPath() {
  // Admin override: set FFMPEG_PATH to a system binary.
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  let p;
  try {
    p = require('ffmpeg-static');
  } catch {
    p = null;
  }
  if (p && fs.existsSync(p)) {
    try {
      require('child_process').execFileSync(p, ['-version'], { stdio: 'ignore', timeout: 10000 });
      return p;
    } catch { /* fall through to system ffmpeg */ }
  }
  try {
    require('child_process').execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 10000 });
    return 'ffmpeg';
  } catch {
    throw new Error('FFMPEG_MISSING: install system ffmpeg or reinstall ffmpeg-static with install scripts enabled.');
  }
}

function ffprobePath() {
  // Admin override: set FFPROBE_PATH to a system binary.
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) return process.env.FFPROBE_PATH;
  let p;
  try {
    p = require('ffprobe-static').path;
  } catch {
    p = null;
  }
  if (p && fs.existsSync(p)) {
    try {
      require('child_process').execFileSync(p, ['-version'], { stdio: 'ignore', timeout: 10000 });
      return p;
    } catch { /* fall through to system ffprobe */ }
  }
  try {
    require('child_process').execFileSync('ffprobe', ['-version'], { stdio: 'ignore', timeout: 10000 });
    return 'ffprobe';
  } catch {
    throw new Error('FFPROBE_MISSING: install system ffprobe or reinstall ffprobe-static with install scripts enabled.');
  }
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
