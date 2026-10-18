'use strict';

/**
 * CELESTIA Download API (dlapi) — the fleet's own downloader service.
 *
 * Serves mp3/mp4 resolve endpoints behind owner-issued API keys and streams
 * the media bytes through itself (same-host proxying defeats the
 * datacenter-IP wall that kills raw googlevideo links).
 *
 * Internal provider chain:
 *   mp3: davidcyril -> apix -> yt-dlp -> bk9
 *   mp4: davidcyril -> bk9 -> yt-dlp
 *
 * Zero npm dependencies (Node 20 global fetch + node:stream).
 *
 * Env:
 *   PORT                 listen port (default 8080)
 *   PUBLIC_BASE          public base URL this service is reachable at (no trailing slash)
 *   DLAPI_KEYS           comma-separated API keys this service accepts
 *   DLAPI_SECRET         HMAC secret for stream tokens
 *   DAVIDCYRIL_APIKEY    upstream key (optional)
 *   APIX_KEY             upstream key (optional)
 *   YTDLP_PATH           yt-dlp binary (default "yt-dlp")
 */

const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { Readable } = require('node:stream');

const PORT = Number(process.env.PORT || 8080);
const PUBLIC_BASE = String(process.env.PUBLIC_BASE || '').replace(/\/+$/, '');
const SECRET = process.env.DLAPI_SECRET || '';
const KEYS = new Set(
  String(process.env.DLAPI_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
const DAVIDCYRIL_APIKEY = process.env.DAVIDCYRIL_APIKEY || '';
const APIX_KEY = process.env.APIX_KEY || '';
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

const UPSTREAM_TIMEOUT_MS = 60000;
const TOKEN_TTL_MS = 6 * 3600 * 1000;

function log() {
  console.log(new Date().toISOString(), ...arguments);
}

function json(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(s),
  });
  res.end(s);
}

function isYouTubeUrl(u) {
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return false;
    const h = x.hostname.replace(/^(www\.|m\.|music\.)/, '');
    return h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com';
  } catch {
    return false;
  }
}

function videoIdOf(u) {
  try {
    const x = new URL(u);
    if (x.hostname.replace(/^(www\.|m\.|music\.)/, '').endsWith('youtu.be')) {
      return x.pathname.slice(1, 12) || null;
    }
    return (x.searchParams.get('v') || '').slice(0, 11) || null;
  } catch {
    return null;
  }
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!p || !p.url || !p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

async function fetchJson(url, headers, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: headers || {}, signal: ac.signal, redirect: 'follow' });
    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* non-json */ }
    return { status: r.status, data: data, text: text };
  } finally {
    clearTimeout(t);
  }
}

async function resolveDavid(kind, videoUrl) {
  if (!DAVIDCYRIL_APIKEY) throw new Error('davidcyril not configured');
  const u = 'https://apis.davidcyriltech.my.id/download/' + kind +
    '?url=' + encodeURIComponent(videoUrl) + '&apikey=' + encodeURIComponent(DAVIDCYRIL_APIKEY);
  const r = await fetchJson(u, {}, UPSTREAM_TIMEOUT_MS);
  const res = r.data && r.data.result;
  if (r.status === 200 && r.data && r.data.success && res && res.download_url) {
    return { url: res.download_url, title: res.title || null, quality: res.quality || '' };
  }
  throw new Error('davidcyril ' + r.status);
}

async function resolveApix(kind, videoUrl) {
  if (!APIX_KEY) throw new Error('apix not configured');
  const u = 'https://apix.wolvarex.com/api/download/youtube/' + kind +
    '?url=' + encodeURIComponent(videoUrl) + '&key=' + encodeURIComponent(APIX_KEY);
  const r = await fetchJson(u, {}, UPSTREAM_TIMEOUT_MS);
  const d = r.data;
  const url = d && (d.downloadUrl || d.proxyUrl);
  if (r.status === 200 && d && d.success && url) {
    const full = url.includes('key=') ? url : url + '&key=' + encodeURIComponent(APIX_KEY);
    return { url: full, title: d.title || null, quality: d.quality || 'mp3' };
  }
  throw new Error('apix ' + r.status + (d && d.error ? ': ' + String(d.error).slice(0, 80) : ''));
}

async function resolveBk9(kind, videoUrl) {
  const u = 'https://api.bk9.dev/download/' + kind + '?url=' + encodeURIComponent(videoUrl);
  const r = await fetchJson(u, {}, UPSTREAM_TIMEOUT_MS);
  const b = r.data && r.data.BK9;
  if (r.status === 200 && r.data && r.data.status && b && b.downloadUrl) {
    return { url: b.downloadUrl, title: b.title || null, quality: b.quality || '' };
  }
  throw new Error('bk9 ' + r.status);
}

function resolveYtdlp(kind, videoUrl) {
  const fmt = kind === 'mp3'
    ? 'bestaudio[ext=m4a]/bestaudio/best'
    : 'b[ext=mp4][height<=720]/b[ext=mp4]/b';
  return new Promise((resolve, reject) => {
    execFile(
      YTDLP,
      ['-g', '--no-playlist', '--no-warnings', '--no-cache-dir', '-f', fmt, videoUrl],
      { timeout: UPSTREAM_TIMEOUT_MS },
      (err, stdout) => {
        if (err) return reject(new Error('yt-dlp: ' + String(err.message || 'failed').slice(0, 120)));
        const url = String(stdout || '').trim().split(/\r?\n/).find(Boolean);
        if (!url) return reject(new Error('yt-dlp: no url'));
        resolve({ url: url, title: null, quality: 'auto' });
      }
    );
  });
}

function providersFor(format, videoUrl) {
  if (format === 'mp3') {
    return [
      ['davidcyril', () => resolveDavid('ytmp3', videoUrl)],
      ['apix', () => resolveApix('mp3', videoUrl)],
      ['yt-dlp', () => resolveYtdlp('mp3', videoUrl)],
      ['bk9', () => resolveBk9('ytmp3', videoUrl)],
    ];
  }
  return [
    ['davidcyril', () => resolveDavid('ytmp4', videoUrl)],
    ['bk9', () => resolveBk9('ytmp4', videoUrl)],
    ['yt-dlp', () => resolveYtdlp('mp4', videoUrl)],
  ];
}

async function handleResolve(res, format, videoUrl) {
  const errs = [];
  for (const [name, fn] of providersFor(format, videoUrl)) {
    try {
      const info = await fn();
      if (!/^https?:\/\//.test(String(info.url || ''))) throw new Error('provider returned non-http url');
      const token = signToken({
        url: info.url,
        exp: Date.now() + TOKEN_TTL_MS,
        title: info.title || null,
        quality: info.quality || null,
      });
      const id = videoIdOf(videoUrl);
      log('resolve', format, name, id || '-');
      return json(res, 200, {
        success: true,
        videoId: id,
        title: info.title || ('YouTube ' + format.toUpperCase()),
        format: format,
        quality: info.quality || '',
        downloadUrl: PUBLIC_BASE + '/api/stream/' + token,
      });
    } catch (e) {
      errs.push(name + ': ' + String(e.message || '').slice(0, 120));
    }
  }
  log('resolve', format, 'failed', errs.join(' | ').slice(0, 300));
  json(res, 502, { success: false, error: 'All providers failed: ' + errs.join(' | ').slice(0, 300) });
}

async function handleStream(req, res, token) {
  const p = verifyToken(token);
  if (!p) return json(res, 403, { success: false, error: 'bad or expired stream token' });
  let up;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const headers = {};
    if (req.headers.range) headers.range = req.headers.range;
    up = await fetch(p.url, { headers: headers, signal: ac.signal, redirect: 'follow' });
  } catch {
    clearTimeout(t);
    return json(res, 502, { success: false, error: 'upstream fetch failed' });
  }
  clearTimeout(t);
  if (!up.ok && up.status !== 206) {
    return json(res, 502, { success: false, error: 'upstream ' + up.status });
  }
  const out = {
    'content-type': up.headers.get('content-type') || 'application/octet-stream',
  };
  const cl = up.headers.get('content-length');
  if (cl) out['content-length'] = cl;
  const cr = up.headers.get('content-range');
  if (cr) out['content-range'] = cr;
  out['accept-ranges'] = up.headers.get('accept-ranges') || 'bytes';
  res.writeHead(up.status === 206 ? 206 : 200, out);
  const body = Readable.fromWeb(up.body);
  body.on('error', () => res.destroy());
  res.on('close', () => { try { body.destroy(); } catch { /* gone */ } });
  body.pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET') return json(res, 405, { success: false, error: 'method not allowed' });
    const x = new URL(req.url, 'http://internal');
    const path = x.pathname;

    if (path === '/health') {
      return json(res, 200, { ok: true, service: 'celestia-dlapi' });
    }

    if (path.startsWith('/api/stream/')) {
      return handleStream(req, res, decodeURIComponent(path.slice('/api/stream/'.length)));
    }

    if (!KEYS.size) return json(res, 503, { success: false, error: 'no API keys configured' });
    const key = x.searchParams.get('key') || '';
    if (!key || !KEYS.has(key)) return json(res, 401, { success: false, error: 'invalid API key' });

    if (path === '/api/download/youtube/mp3' || path === '/api/download/youtube/mp4') {
      const format = path.endsWith('mp3') ? 'mp3' : 'mp4';
      const videoUrl = x.searchParams.get('url') || '';
      if (!isYouTubeUrl(videoUrl)) {
        return json(res, 400, { success: false, error: 'url must be a YouTube link' });
      }
      return handleResolve(res, format, videoUrl);
    }

    return json(res, 404, { success: false, error: 'not found' });
  } catch (e) {
    log('error', String(e && e.message || e).slice(0, 200));
    try { json(res, 500, { success: false, error: 'internal error' }); } catch { /* sent */ }
  }
});

server.listen(PORT, () => log('celestia-dlapi listening on', PORT));
