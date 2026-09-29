/**
 * utils/dlproxy.js — client for your own CELESTIA download proxy.
 *
 * Config (chat-set wins, env is the deploy fallback):
 *   .dlproxy url https://your-tunnel-url   → settings dlproxy_url / env DLPROXY_URL
 *   .dlproxy key <client-key>               → settings dlproxy_key / env DLPROXY_KEY
 * Skips silently when unconfigured so the chain falls through to Apix/yt-dlp.
 */
const axios = require('axios');
const cfg = require('../download/config');

const TIMEOUT = 180000;

function normalizeBaseUrl(value) {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(String(value)); } catch { return null; }
  if (parsed.username || parsed.password) return null;
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) return null;
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

function baseUrl() {
  try {
    const store = require('./settingsStore');
    const u = store.get('dlproxy_url', null);
    if (u) return normalizeBaseUrl(u);
  } catch { /* ignore */ }
  return normalizeBaseUrl(process.env.DLPROXY_URL);
}

function apiKey() {
  try {
    const store = require('./settingsStore');
    const k = store.get('dlproxy_key', null);
    if (k) return k;
  } catch { /* ignore */ }
  return process.env.DLPROXY_KEY || null;
}

function configured() {
  return !!(baseUrl() && apiKey());
}

async function fetchKind(kind, videoUrl, signal) {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) throw new Error('no dlproxy configured');
  const r = await axios.get(`${base}/api/download/youtube/${kind}`, {
    params: { url: videoUrl },
    headers: { 'x-api-key': key },
    responseType: 'arraybuffer',
    timeout: TIMEOUT,
    signal,
    maxRedirects: 0,
    maxContentLength: kind === 'mp3' ? cfg.MAX_AUDIO_BYTES : cfg.MAX_VIDEO_BYTES,
    maxBodyLength: kind === 'mp3' ? cfg.MAX_AUDIO_BYTES : cfg.MAX_VIDEO_BYTES,
    validateStatus: () => true,
  });
  const ctype = String(r.headers?.['content-type'] || '');
  if (r.status !== 200 || ctype.includes('application/json')) {
    let detail = `HTTP ${r.status}`;
    try {
      const j = JSON.parse(Buffer.from(r.data || []).toString('utf8'));
      if (j.error) detail = j.error;
    } catch { /* keep status */ }
    throw new Error('dlproxy failed (' + detail + ')');
  }
  const buf = Buffer.from(r.data || []);
  if (!buf.length) throw new Error('dlproxy returned empty bytes');
  return { buf, ctype };
}

async function dlproxyAudio(videoUrl, signal) {
  const { buf } = await fetchKind('mp3', videoUrl, signal);
  return { buf, title: 'dlproxy audio' };
}

async function dlproxyVideo(videoUrl, signal) {
  const { buf } = await fetchKind('mp4', videoUrl, signal);
  return { buf, title: 'dlproxy video' };
}

module.exports = { configured, baseUrl, apiKey, normalizeBaseUrl, dlproxyAudio, dlproxyVideo };
