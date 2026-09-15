/**
 * download/ytdlp.js — yt-dlp as the PRIMARY download engine.
 * Safe spawning (arg arrays, no shell). Max 3 attempts, never infinite.
 * Attempt 1: requested quality. Attempt 2: closest available (best).
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cfg = require('./config');
const { ensureYtDlp, ffmpegPath, aria2cPath } = require('./engines');
const { selectorFor, FALLBACK_SELECTOR } = require('./formats');
const { classify } = require('./errors');

function baseArgs(workDir, ffmpeg, maxBytes) {
  const a = [
    '--no-warnings',
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
    '-o', path.join(workDir, 'out.%(ext)s'),
  ];
  if (maxBytes) a.push('--max-filesize', String(maxBytes));
  return a;
}

function runSpawn(bin, args, workDir, onProgress, overallMs = cfg.YTDLP_OVERALL_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: workDir, windowsHide: true });
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
  const files = fs.readdirSync(workDir).filter((f) => f.startsWith('out.'));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(path.join(workDir, b)).size - fs.statSync(path.join(workDir, a)).size);
  return path.join(workDir, files[0]);
}

async function download({ url, quality, workDir, onProgress, maxBytes }) {
  const bin = await ensureYtDlp();
  const ffmpeg = ffmpegPath(); // throws FFMPEG_MISSING with admin diagnostic
  const aria = await aria2cPath().catch(() => null);

  const isAudio = quality && quality.kind === 'audio';
  const wanted = selectorFor(quality);
  // Attempt plan (max 3, never infinite): requested -> requested via the
  // android player client (shrugs off datacenter throttling/bot-checks) ->
  // closest available. Restricted/private content is NOT retried.
  const ANDROID = ['--extractor-args', 'youtube:player_client=android'];
  const plan = [{ selector: wanted, extra: [] }];
  if (wanted !== FALLBACK_SELECTOR) plan.push({ selector: wanted, extra: ANDROID });
  plan.push({ selector: FALLBACK_SELECTOR, extra: ANDROID });
  const attempts = plan.slice(0, cfg.YTDLP_MAX_ATTEMPTS);

  let lastErr = null;
  for (let attempt = 1; attempt <= attempts.length; attempt++) {
    const args = baseArgs(workDir, ffmpeg, maxBytes);
    if (aria) args.push('--external-downloader', 'aria2c', '--external-downloader-args', 'aria2c:-x 4 -s 4 -k 2M');
    args.push(...attempts[attempt - 1].extra);
    if (isAudio) {
      args.push('-f', 'bestaudio/best', '--extract-audio', '--audio-format', 'mp3');
    } else {
      args.push('-f', attempts[attempt - 1].selector);
    }
    args.push(url);
    try {
      await runSpawn(bin, args, workDir, onProgress);
      const file = findOutput(workDir);
      if (!file) {
        const e = new Error(maxBytes ? 'Aborted: file exceeds the configured size cap.' : 'yt-dlp finished but produced no file.');
        if (maxBytes) e.userDetail = 'File is too large — try Audio or a shorter video.';
        throw e;
      }
      const size = fs.statSync(file).size;
      if (!size) throw new Error('Downloaded file was empty.');
      return { file, size, kind: isAudio ? 'audio' : 'video', selector: attempts[attempt - 1].selector, attempt };
    } catch (e) {
      lastErr = e;
      const cat = classify(e);
      // Don't blindly retry restricted/unavailable content on every backend.
      if (cat === 'restricted' || cat === 'unavailable' || cat === 'ffmpeg-missing') break;
    }
  }
  throw lastErr || new Error('Download failed.');
}

module.exports = { download };
