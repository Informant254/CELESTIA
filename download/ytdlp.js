/**
 * download/ytdlp.js — yt-dlp single-attempt primitives.
 * The fallback LOOP lives in fallback.js; this module never retries by itself.
 * Safe spawning (arg arrays, no shell). Live children are tracked per job dir
 * so a global timeout can kill a stalled spawn without touching other jobs.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const cfg = require('./config');
const { ensureYtDlp, ffmpegPath, aria2cPath } = require('./engines');

const PARTIAL_RE = /\.(part|temp|tmp|ytdl)$/i;

// YouTube trusts a logged-in session far more than a datacenter IP.
// If the owner drops their browser cookies at cookies/youtube.txt (or
// YOUTUBE_COOKIES_FILE), every attempt authenticates as them and the
// "Sign in to confirm you're not a bot" wall usually falls.
// NEVER commit that file — it's a live YouTube session, like SESSION_ID.
function cookieFile() {
  const file = String(process.env.YOUTUBE_COOKIES_FILE || '').trim();
  try { if (file && fs.existsSync(file) && fs.statSync(file).size > 0) return file; } catch {}
  return null;
}

function youtubeProxy() {
  const value = String(process.env.YOUTUBE_PROXY || '').trim();
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (!['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'].includes(parsed.protocol)) return null;
  return value;
}

function sourceAddress() {
  const value = String(process.env.YOUTUBE_SOURCE_ADDRESS || '').trim();
  return net.isIP(value) ? value : null;
}

// workDir -> Set<ChildProcess>
const live = new Map();

function track(workDir, child) {
  if (!live.has(workDir)) live.set(workDir, new Set());
  live.get(workDir).add(child);
  child.on('close', () => {
    const s = live.get(workDir);
    if (s) {
      s.delete(child);
      if (!s.size) live.delete(workDir);
    }
  });
}

function abortDir(workDir) {
  const s = live.get(workDir);
  if (!s) return 0;
  let n = 0;
  for (const child of [...s]) {
    try { child.kill(); n += 1; } catch { /* already dead */ }
  }
  return n;
}

function baseArgs(workDir, ffmpeg, maxBytes) {
  const a = [
    '--no-warnings',
    // YouTube now serves JS challenges on datacenter IPs — without a JS
    // runtime every player request dies as EXTRACTOR_ERROR. Node is
    // guaranteed present (the bot runs on it).
    '--js-runtimes', 'node',
    '--retries', '3',
    '--fragment-retries', '3',
    '--extractor-retries', '3',
    '--file-access-retries', '3',
    '--retry-sleep', 'exp=1:5',
    '--sleep-requests', '1',
    '--socket-timeout', String(cfg.YTDLP_SOCKET_TIMEOUT),
    '--continue',
    '--newline',
    '--progress',
    '--ffmpeg-location', ffmpeg,
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '-S', 'vcodec:h264',
    '-o', path.join(workDir, 'out.%(ext)s'),
  ];
  if (maxBytes) a.push('--max-filesize', String(maxBytes));
  const cookies = cookieFile();
  if (cookies) a.push('--cookies', cookies);
  const proxy = youtubeProxy();
  if (proxy) a.push('--proxy', proxy);
  const source = sourceAddress();
  if (source) a.push('--source-address', source);
  return a;
}

function runSpawn(bin, args, workDir, onProgress, overallMs = cfg.YTDLP_OVERALL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: workDir, windowsHide: true });
    track(workDir, child);
    let stderrTail = '';
    let lastFrac = -1;
    let done = false;
    const finish = (fn, val) => { if (!done) { done = true; clearTimeout(killer); fn(val); } };
    const killer = setTimeout(() => {
      try { child.kill(); } catch { /* already dead */ }
      finish(reject, new Error('yt-dlp ran past the overall time budget — network too slow or stalled.'));
    }, overallMs);
    if (killer.unref) killer.unref();
    child.stdout.on('data', (d) => {
      for (const line of String(d).split('\n')) {
        const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (m && onProgress) {
          const frac = Math.min(0.99, parseFloat(m[1]) / 100);
          if (frac - lastFrac >= 0.05) {
            lastFrac = frac;
            try { onProgress(frac); } catch { /* never break on UI */ }
          }
        }
      }
    });
    child.stderr.on('data', (d) => {
      stderrTail = (stderrTail + String(d)).slice(-2000);
    });
    child.on('error', (e) => finish(reject, new Error(e.message)));
    child.on('close', (code) => {
      if (code === 0) return finish(resolve, true);
      finish(reject, new Error(stderrTail.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300) || `yt-dlp exited with code ${code}`));
    });
  });
}

function findOutput(workDir) {
  let files = [];
  try {
    files = fs.readdirSync(workDir).filter((f) => f.startsWith('out.') && !PARTIAL_RE.test(f));
  } catch {
    return null;
  }
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(workDir, b)).size - fs.statSync(path.join(workDir, a)).size);
  return path.join(workDir, files[0]);
}

// One attempt. Throws on any failure. Never retries.
async function attempt({ url, selector, extra = [], audio = false, workDir, onProgress, maxBytes }) {
  const bin = await ensureYtDlp();
  const ffmpeg = ffmpegPath(); // throws DEPENDENCY_MISSING with admin diagnostic
  const aria = await aria2cPath().catch(() => null);

  const args = baseArgs(workDir, ffmpeg, maxBytes);
  if (aria) args.push('--external-downloader', 'aria2c', '--external-downloader-args', 'aria2c:-x 4 -s 4 -k 2M');
  args.push(...extra);
  if (audio) {
    args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3');
  } else {
    args.push('-f', selector);
  }
  args.push(url);

  await runSpawn(bin, args, workDir, onProgress);
  const file = findOutput(workDir);
  if (!file) {
    const e = new Error(maxBytes ? 'Aborted: file exceeds the configured size cap.' : 'yt-dlp finished but produced no file.');
    if (maxBytes) e.userDetail = 'File is too large — try Audio or a shorter video.';
    throw e;
  }
  const size = fs.statSync(file).size;
  if (!size) throw new Error('Downloaded file was empty.');
  return { file, size };
}

module.exports = { attempt, abortDir, findOutput, baseArgs, cookieFile, youtubeProxy, sourceAddress };
