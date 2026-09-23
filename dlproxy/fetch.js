/**
 * dlproxy/fetch.js — resolve + fetch YouTube media via yt-dlp.
 *
 * Runs on a residential connection (home PC / Pi), where YouTube treats us
 * like a normal viewer. Downloads to a temp file, returns the path; the
 * caller streams it and cleans up. Exported fetchMedia is replaceable in
 * tests via setFetcher.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let fetcher = defaultFetch;

function setFetcher(fn) { fetcher = fn; }

async function fetchMedia(kind, videoUrl, { timeoutMs = 150000 } = {}) {
  return fetcher(kind, videoUrl, { timeoutMs });
}

function defaultFetch(kind, videoUrl, { timeoutMs }) {
  return new Promise((resolve, reject) => {
    let engines;
    try {
      engines = require('../download/engines');
    } catch (e) {
      return reject(new Error('engine bootstrap unavailable: ' + e.message));
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlproxy-'));
    const outTpl = path.join(dir, 'media.%(ext)s');
    const args = kind === 'mp3'
      ? ['-o', outTpl, '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '--extract-audio', '--audio-format', 'mp3', '--no-playlist',
        '--no-warnings', '--socket-timeout', '20', videoUrl]
      : ['-o', outTpl, '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
        '--merge-output-format', 'mp4', '--no-playlist',
        '--no-warnings', '--socket-timeout', '20', videoUrl];

    let settled = false;
    const done = (err, file) => {
      if (settled) return;
      settled = true;
      if (err) {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        reject(err);
      } else {
        resolve({ file, dir });
      }
    };

    (async () => {
      let bin;
      try {
        bin = engines.ytdlpPath();
        if (!fs.existsSync(bin)) {
          await engines.ensureYtDlp();
          bin = engines.ytdlpPath();
        }
      } catch (e) {
        return done(new Error('yt-dlp unavailable: ' + e.message));
      }
      const ff = (() => { try { return engines.ffmpegPath(); } catch { return null; } })();
      const fullArgs = ff ? ['--ffmpeg-location', ff, ...args] : args;
      const child = spawn(bin, fullArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += String(d).slice(-2000); });
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        done(new Error('fetch timed out (source slow or blocked from here)'));
      }, timeoutMs);
      child.on('error', (e) => { clearTimeout(timer); done(new Error('yt-dlp spawn failed: ' + e.message)); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          const tail = stderr.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 300);
          return done(new Error(tail || `yt-dlp exited with code ${code}`));
        }
        try {
          const files = fs.readdirSync(dir).filter((f) => !/\.(part|temp|tmp|ytdl)$/i.test(f));
          const want = kind === 'mp3' ? /\.mp3$/i : /\.mp4$/i;
          const hit = files.find((f) => want.test(f)) || files[0];
          if (!hit) return done(new Error('yt-dlp produced no file'));
          const file = path.join(dir, hit);
          if (!fs.statSync(file).size) return done(new Error('empty media file'));
          done(null, file);
        } catch (e) {
          done(e);
        }
      });
    })();
  });
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

module.exports = { fetchMedia, setFetcher, cleanup };
