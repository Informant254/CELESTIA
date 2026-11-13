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
const { ensureYtDlp, ensureYtDlpTools, aria2cPath } = require('./engines');
const cookies = require('./cookies');

const PARTIAL_RE = /\.(part|temp|tmp|ytdl)$/i;

// YouTube trusts a logged-in session far more than a datacenter IP.
// The owner can upload a persistent cookie jar with .ytcookies upload (legacy
// cookies/youtube.txt and YOUTUBE_COOKIES_FILE also work). Attempts use it and the
// "Sign in to confirm you're not a bot" wall usually falls.
// NEVER commit that file — it's a live YouTube session, like SESSION_ID.
function cookieFile() {
  return cookies.cookieFile();
}

function jsRuntime() {
  const configured = String(process.env.YTDLP_NODE_PATH || '').trim();
  if (configured && fs.existsSync(configured)) return `node:${configured}`;
  // Shared private fleets can use a current Node runtime for YouTube challenges
  // without changing the bot runtime (and breaking installed native modules).
  if (process.env.YOUTUBE_COOKIES_SHARED === 'true' && process.env.YOUTUBE_COOKIES_FILE) {
    const shared = path.join(path.dirname(process.env.YOUTUBE_COOKIES_FILE), 'node22');
    if (fs.existsSync(shared)) return `node:${shared}`;
  }
  return 'node';
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

function baseArgs(workDir, ffmpeg, maxBytes, { youtube = true, cookiePath = undefined } = {}) {
  const a = [
    '--no-warnings',
    // YouTube now serves JS challenges on datacenter IPs — without a JS
    // runtime extraction can fail. Current challenges require Node >=22;
    // jsRuntime can select a supported sidecar binary for older bot images.
    '--js-runtimes', jsRuntime(),
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
  if (youtube) {
    const file = cookiePath === undefined ? cookieFile() : cookiePath;
    if (file) a.push('--cookies', file);
    const proxy = youtubeProxy();
    if (proxy) a.push('--proxy', proxy);
    const source = sourceAddress();
    if (source) a.push('--source-address', source);
  }
  return a;
}

function runSpawn(bin, args, workDir, onProgress, overallMs = cfg.YTDLP_OVERALL_TIMEOUT_MS, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('Download cancelled.'));
    const child = spawn(bin, args, { cwd: workDir, windowsHide: true });
    track(workDir, child);
    let stderrTail = '';
    let lastFrac = -1;
    let done = false;
    const finish = (fn, val) => {
      if (!done) {
        done = true;
        clearTimeout(killer);
        if (signal) signal.removeEventListener('abort', onAbort);
        fn(val);
      }
    };
    const onAbort = () => {
      try { child.kill(); } catch { /* already dead */ }
      finish(reject, signal.reason || new Error('Download cancelled.'));
    };
    const killer = setTimeout(() => {
      try { child.kill(); } catch { /* already dead */ }
      finish(reject, new Error('yt-dlp ran past the overall time budget — network too slow or stalled.'));
    }, overallMs);
    if (killer.unref) killer.unref();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
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

async function findOutput(workDir) {
  let files = [];
  try {
    files = (await fs.promises.readdir(workDir)).filter((f) => f.startsWith('out.') && !PARTIAL_RE.test(f));
  } catch {
    return null;
  }
  if (!files.length) return null;
  const ranked = await Promise.all(files.map(async (file) => ({
    file,
    size: (await fs.promises.stat(path.join(workDir, file))).size,
  })));
  ranked.sort((a, b) => b.size - a.size);
  return path.join(workDir, ranked[0].file);
}

// One attempt. Throws on any failure. Never retries.
async function attempt({ url, selector, extra = [], audio = false, workDir, onProgress, maxBytes, youtube = true, signal }) {
  const bin = await ensureYtDlp();
  const mediaTools = await ensureYtDlpTools();
  const aria = await aria2cPath().catch(() => null);
  if (youtube) await cookies.prepare(signal);
  let jar = youtube ? cookies.snapshot(workDir) : null;

  const args = baseArgs(workDir, mediaTools, maxBytes, { youtube, cookiePath: jar?.file || null });
  if (aria) args.push('--external-downloader', 'aria2c', '--external-downloader-args', 'aria2c:-x 4 -s 4 -k 2M');
  args.push(...extra);
  if (audio) {
    args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3');
  } else {
    args.push('-f', selector);
  }
  args.push(url);

  try {
    await runSpawn(bin, args, workDir, onProgress, cfg.YTDLP_OVERALL_TIMEOUT_MS, signal);
  } catch (error) {
    if (!youtube || !cookies.authFailure(error) || signal?.aborted) throw error;
    cookies.reject(jar?.hash);
    await cookies.refresh({ signal, force: true });
    const replacement = cookies.snapshot(workDir);
    if (!replacement || replacement.hash === jar?.hash) throw error;
    const index = args.indexOf('--cookies');
    if (index >= 0) args[index + 1] = replacement.file;
    else args.splice(args.length - 1, 0, '--cookies', replacement.file);
    jar = replacement;
    try {
      await runSpawn(bin, args, workDir, onProgress, cfg.YTDLP_OVERALL_TIMEOUT_MS, signal);
    } catch (retryError) {
      if (cookies.authFailure(retryError)) cookies.reject(jar.hash);
      throw retryError;
    }
  }
  await cookies.saveUpdated(jar);
  const file = await findOutput(workDir);
  if (!file) {
    const e = new Error(maxBytes ? 'Aborted: file exceeds the configured size cap.' : 'yt-dlp finished but produced no file.');
    if (maxBytes) e.userDetail = 'File is too large — try Audio or a shorter video.';
    throw e;
  }
  const size = (await fs.promises.stat(file)).size;
  if (!size) throw new Error('Downloaded file was empty.');
  return { file, size };
}

module.exports = { attempt, abortDir, findOutput, baseArgs, cookieFile, jsRuntime, youtubeProxy, sourceAddress };
