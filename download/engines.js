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
const YTDLP_RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const YTDLP_SUMS_URL = `${YTDLP_RELEASE_BASE}/SHA2-256SUMS`;
const YTDLP_URL = `${YTDLP_RELEASE_BASE}/${YTDLP_ASSET}`;
let ensurePromise = null;
let ensuredBin = null;

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

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function expectedChecksum(manifest, asset = YTDLP_ASSET) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(manifest || '').match(new RegExp(`^([a-f0-9]{64})\\s+\\*?${escaped}$`, 'im'));
  if (!match) throw new Error(`Official yt-dlp checksum manifest does not contain ${asset}.`);
  return match[1].toLowerCase();
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
  let currentValid = false;
  if (fs.existsSync(bin)) {
    try { await runOnce(bin, ['--version'], 20000); currentValid = true; } catch {}
  }

  let expected;
  try {
    expected = expectedChecksum((await get(YTDLP_SUMS_URL)).toString('utf8'));
  } catch (error) {
    if (currentValid) return bin;
    throw new Error(`Could not retrieve official yt-dlp checksums: ${error.message}`);
  }

  if (currentValid) {
    try {
      if (sha256(await fs.promises.readFile(bin)) === expected) return bin;
    } catch { /* replace below */ }
  }

  await fs.promises.mkdir(BIN_DIR, { recursive: true });
  const tmp = bin + '.part';
  const buf = await get(YTDLP_URL);
  if (!buf || buf.length < 1024 * 1024) {
    throw new Error('yt-dlp download looked truncated — refusing to install.');
  }
  const digest = sha256(buf);
  if (digest !== expected) {
    throw new Error('Latest yt-dlp binary failed official SHA-256 verification.');
  }
  await fs.promises.writeFile(tmp, buf);
  if (process.platform !== 'win32') {
    try { await fs.promises.chmod(tmp, 0o755); } catch { /* best effort */ }
  }
  await fs.promises.rename(tmp, bin);
  await runOnce(bin, ['--version'], 20000); // throws with clear error if broken
  return bin;
}

function ensureYtDlp() {
  if (ensuredBin) return Promise.resolve(ensuredBin);
  if (!ensurePromise) {
    ensurePromise = installYtDlp()
      .then((bin) => { ensuredBin = bin; return bin; })
      .finally(() => { ensurePromise = null; });
  }
  return ensurePromise;
}

let ffmpegCache = null;
let ffmpegPromise = null;
let ffprobeCache = null;
let ffprobePromise = null;

async function resolveMediaBinary({ override, bundled, system, label }) {
  const candidates = [];
  if (override && fs.existsSync(override)) candidates.push(override);
  if (bundled && fs.existsSync(bundled)) candidates.push(bundled);
  candidates.push(system);
  for (const candidate of [...new Set(candidates)]) {
    try {
      await runOnce(candidate, ['-version'], 10000);
      return candidate;
    } catch { /* try the next installed option */ }
  }
  throw new Error(`${label}_MISSING: install system ${system} or reinstall its static package with install scripts enabled.`);
}

function ensureFfmpegPath() {
  if (ffmpegCache) return Promise.resolve(ffmpegCache);
  if (!ffmpegPromise) {
    let bundled = null;
    try { bundled = require('ffmpeg-static'); } catch {}
    ffmpegPromise = resolveMediaBinary({
      override: process.env.FFMPEG_PATH,
      bundled,
      system: 'ffmpeg',
      label: 'FFMPEG',
    }).then((bin) => {
      ffmpegCache = bin;
      return bin;
    }).finally(() => { ffmpegPromise = null; });
  }
  return ffmpegPromise;
}

function ensureFfprobePath() {
  if (ffprobeCache) return Promise.resolve(ffprobeCache);
  if (!ffprobePromise) {
    let bundled = null;
    try { bundled = require('ffprobe-static').path; } catch {}
    ffprobePromise = resolveMediaBinary({
      override: process.env.FFPROBE_PATH,
      bundled,
      system: 'ffprobe',
      label: 'FFPROBE',
    }).then((bin) => {
      ffprobeCache = bin;
      return bin;
    }).finally(() => { ffprobePromise = null; });
  }
  return ffprobePromise;
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
  try { out.ffmpeg = (await runOnce(await ensureFfmpegPath(), ['-version'], 15000)).split('\n')[0]; } catch { out.ffmpeg = null; }
  try { out.ffprobe = (await runOnce(await ensureFfprobePath(), ['-version'], 15000)).split('\n')[0]; } catch { out.ffprobe = null; }
  out.aria2c = await aria2cPath();
  try {
    tmpDir();
    out.storage = true;
  } catch { out.storage = false; }
  return out;
}

module.exports = {
  ensureYtDlp, ytdlpPath,
  ensureFfmpegPath, ensureFfprobePath,
  aria2cPath, tmpDir, status, runOnce, expectedChecksum, sha256,
};
