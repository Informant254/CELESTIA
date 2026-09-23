/**
 * utils/dlproxy.js — client for your own CELESTIA download proxy.
 *
 * Config (chat-set wins, env is the deploy fallback):
 *   .dlproxy url https://your-tunnel-url   → settings dlproxy_url / env DLPROXY_URL
 *   .dlproxy key <client-key>               → settings dlproxy_key / env DLPROXY_KEY
 * Skips silently when unconfigured so the chain falls through to Apix/yt-dlp.
 */
const axios = require('axios');

const TIMEOUT = 180000;

function baseUrl() {
  try {
    const store = require('./settingsStore');
    const u = store.get('dlproxy_url', null);
    if (u) return String(u).replace(/\/+$/, '');
  } catch { /* ignore */ }
  const env = process.env.DLPROXY_URL;
  return env ? String(env).replace(/\/+$/, '') : null;
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

async function fetchKind(kind, videoUrl) {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) throw new Error('no dlproxy configured');
  const r = await axios.get(`${base}/api/download/youtube/${kind}`, {
    params: { url: videoUrl, key },
    responseType: 'arraybuffer',
    timeout: TIMEOUT,
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

async function dlproxyAudio(videoUrl) {
  const { buf } = await fetchKind('mp3', videoUrl);
  return { buf, title: 'dlproxy audio' };
}

async function dlproxyVideo(videoUrl) {
  const { buf } = await fetchKind('mp4', videoUrl);
  return { buf, title: 'dlproxy video' };
}

module.exports = { configured, baseUrl, apiKey, dlproxyAudio, dlproxyVideo };
