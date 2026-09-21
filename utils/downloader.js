/**
 * utils/downloader.js — CELESTIA shared download sources (verified live).
 *
 *  SEARCH : siputzx  -> yt-search (npm fallback)
 *  AUDIO  : bk9      -> davidcyril
 *  VIDEO  : davidcyril (480p mp4)
 *  SOCIAL : bk9 (tiktok / instagram / fb / twitter)
 *
 * Every function resolves to { url, title } or throws a human-readable Error.
 */
const axios = require('axios');
const dns = require('dns').promises;
const net = require('net');

let yts = null;
try {
  yts = require('yt-search');
} catch {
  yts = null; // optional — API search is primary
}

const TIMEOUT = 60000;
// Fallback download APIs get a shorter fuse — a dead provider must fail
// fast so the next one gets its chance inside the job timeout.
const API_TIMEOUT = 30000;
// Optional davidcyriltech API key (their endpoints now 402 without one).
// Set DAVIDCYRIL_APIKEY and both davidcyril fallbacks authenticate.
function dcUrl(endpoint, videoUrl) {
  const key = process.env.DAVIDCYRIL_APIKEY || '';
  const base = `https://apis.davidcyriltech.my.id/download/${endpoint}?url=${encodeURIComponent(videoUrl)}`;
  return key ? `${base}&apikey=${encodeURIComponent(key)}` : base;
}

function isPublicIp(address) {
  const ip = String(address || '').replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(ip);
  if (family === 4) {
    const n = ip.split('.').reduce((v, part) => (v * 256) + Number(part), 0) >>> 0;
    return ![
      [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
      [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
      [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24],
      [0xe0000000, 4], [0xf0000000, 4],
    ].some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicIp(mapped[1]);
    if (lower === '::' || lower === '::1') return false;
    const parts = lower.split(':');
    const first = parseInt(parts[0] || '0', 16);
    const second = parseInt(parts[1] || '0', 16);
    if ((first & 0xe000) !== 0x2000) return false; // only global-unicast 2000::/3
    if (first === 0x2001 && (second <= 0x01ff || second === 0x0db8)) return false;
    return !(first === 0x3fff && second <= 0x0fff);
  }
  return false;
}

async function validateDownloadUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Provider returned an invalid download URL.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Provider returned an unsafe download URL.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Provider download URL resolves to a private or reserved address.');
  }
  return parsed.toString();
}

async function downloadBuffer(value, maxBytes, timeout = 120000, redirects = 5) {
  const url = await validateDownloadUrl(value);
  const res = await axios.get(url, {
    responseType: 'stream', timeout, maxRedirects: 0,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (res.status >= 300) {
    res.data.resume();
    if (!res.headers.location || redirects <= 0) throw new Error('Too many or invalid download redirects.');
    return downloadBuffer(new URL(res.headers.location, url).toString(), maxBytes, timeout, redirects - 1);
  }
  const declared = Number(res.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    res.data.destroy();
    throw new Error(`Fallback file is too large (over the configured ${maxBytes} byte limit).`);
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    res.data.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        res.data.destroy(new Error(`Fallback file is too large (over the configured ${maxBytes} byte limit).`));
        return;
      }
      chunks.push(chunk);
    });
    res.data.on('end', () => resolve(Buffer.concat(chunks, total)));
    res.data.on('error', reject);
  });
}

async function ytSearch(query) {
  try {
    const r = await axios.get(
      `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
      { timeout: 25000 }
    );
    const list = r.data?.data;
    if (Array.isArray(list) && list.length && list[0].url) {
      return { url: list[0].url, title: list[0].title || 'YouTube' };
    }
    throw new Error('no results');
  } catch (e1) {
    if (!yts) throw new Error(`Search failed (${e1.response?.status || e1.message}). Try again.`);
    const s = await yts(query);
    const v = s.videos?.[0];
    if (!v) throw new Error('No results found.');
    return { url: v.url, title: v.title };
  }
}

// Apix key: chat-set key wins, env is the deploy fallback. The same key
// unlocks Apix AI and Apix downloads.
function apixKey() {
  try {
    const store = require('./settingsStore');
    const k = store.get('apix_key', null);
    if (k) return k;
  } catch { /* settings unavailable in tests */ }
  return process.env.APIX_KEY || null;
}

const APIX_BASE = 'https://apix.wolvarex.com';

// Apix serves the bytes proxied from its own host (/api/music/proxy), so
// these links fetch fine from datacenter IPs — unlike raw googlevideo URLs.
async function apixMedia(kind, videoUrl, fallbackTitle) {
  const key = apixKey();
  if (!key) throw new Error('no Apix key configured');
  const r = await axios.get(
    `${APIX_BASE}/api/download/youtube/${kind}?url=${encodeURIComponent(videoUrl)}&key=${encodeURIComponent(key)}`,
    { timeout: API_TIMEOUT }
  );
  const url = r.data?.downloadUrl || r.data?.proxyUrl;
  if (r.data?.success && url) {
    const fileUrl = url.includes('key=') ? url : url + `&key=${encodeURIComponent(key)}`;
    return { url: await validateDownloadUrl(fileUrl), title: r.data?.title || fallbackTitle };
  }
  throw new Error(r.data?.error || 'no media link');
}

async function apixAudio(videoUrl, fallbackTitle = 'YouTube Audio') {
  try {
    return await apixMedia('mp3', videoUrl, fallbackTitle);
  } catch (e) {
    throw new Error('Apix audio failed (' + (e.response?.status || e.message) + ').');
  }
}

async function apixVideo(videoUrl, fallbackTitle = 'YouTube Video') {
  try {
    return await apixMedia('mp4', videoUrl, fallbackTitle);
  } catch (e) {
    throw new Error('Apix video failed (' + (e.response?.status || e.message) + ').');
  }
}

async function ytAudio(videoUrl, fallbackTitle = 'YouTube Audio') {
  const errs = [];
  // 1) bk9 first — verified alive, links stream cross-network.
  try {
    const r = await axios.get(
      `https://api.bk9.dev/download/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      { timeout: API_TIMEOUT }
    );
    const b = r.data?.BK9;
    if (r.data?.status && b?.downloadUrl) {
      return { url: await validateDownloadUrl(b.downloadUrl), title: b.title || fallbackTitle };
    }
    throw new Error('no audio link');
  } catch (e) {
    errs.push('bk9: ' + (e.response?.status || e.message));
  }
  // 2) davidcyril (needs DAVIDCYRIL_APIKEY since they gated it — without a
  // key this fails fast and costs nothing).
  try {
    const r = await axios.get(dcUrl('ytmp3', videoUrl), { timeout: API_TIMEOUT });
    const res = r.data?.result;
    if (r.data?.success && res?.download_url) {
      return { url: await validateDownloadUrl(res.download_url), title: res.title || fallbackTitle };
    }
    throw new Error('no audio link');
  } catch (e) {
    errs.push('davidcyril: ' + (e.response?.status || e.message));
  }
  throw new Error('Audio download failed (' + errs.join(' · ') + '). Try again later.');
}

async function ytVideo(videoUrl, fallbackTitle = 'YouTube Video') {
  try {
    const r = await axios.get(dcUrl('ytmp4', videoUrl), { timeout: API_TIMEOUT });
    const res = r.data?.result;
    if (r.data?.success && res?.download_url) {
      return { url: await validateDownloadUrl(res.download_url), title: res.title || fallbackTitle, quality: res.quality || '' };
    }
    throw new Error(res?.message || 'no video link');
  } catch (e) {
    throw new Error('Video download failed (' + (e.response?.status || e.message) + '). Try again later.');
  }
}

// Recursively find the first http(s) string in an unknown API payload.
function firstMediaUrl(node, depth = 0) {
  const all = collectMediaUrls(node);
  return all.length ? all[0].url : null;
}

// Collect EVERY candidate URL with its field-name context, ranked so clean
// files beat watermarked/thumbnail/preview variants.
function collectMediaUrls(node, key = '', depth = 0, out = []) {
  if (depth > 5 || node == null) return out;
  if (typeof node === 'string' && /^https?:\/\//.test(node)) {
    out.push({ url: node, key: String(key || '').toLowerCase() });
    return out;
  }
  if (Array.isArray(node)) {
    for (const v of node) collectMediaUrls(v, key, depth + 1, out);
    return out;
  }
  if (typeof node === 'object') {
    for (const k of ['url', 'downloadUrl', 'download_url', 'video', 'videoUrl', 'hd', 'sd', 'play', 'wmplay', 'media', 'src', 'link', 'BK9']) {
      if (node[k] !== undefined) collectMediaUrls(node[k], k, depth + 1, out);
    }
    for (const [k, v] of Object.entries(node)) {
      if (['url', 'downloadUrl', 'download_url', 'video', 'videoUrl', 'hd', 'sd', 'play', 'wmplay', 'media', 'src', 'link', 'BK9'].includes(k)) continue;
      collectMediaUrls(v, k, depth + 1, out);
    }
  }
  return out;
}

function rankMediaUrl(c) {
  const k = c.key;
  const u = c.url.toLowerCase();
  // watermark / preview / thumbnail signals — always last
  if (/wm|watermark/.test(k) || /watermark/.test(u)) return 100;
  if (/thumb|preview|poster|cover|image_preview/.test(k)) return 90;
  if (/\.(jpg|jpeg|png|webp)(\?|$)/.test(u) && !/\.(mp4|mov|webm)(\?|$)/.test(u)) return 80;
  // clean video signals first
  if (/^(hd|downloadurl|download_url|video|videourl|play|no_wm|nowm|nologo)$/.test(k)) return 0;
  if (/\.(mp4|mov|webm)(\?|$)/.test(u)) return 10;
  return 50;
}

// Best clean candidate: lowest rank wins (stable for ties).
function pickCleanUrl(payload) {
  const all = collectMediaUrls(payload);
  if (!all.length) return null;
  all.sort((a, b) => rankMediaUrl(a) - rankMediaUrl(b));
  return all[0].url;
}

async function bk9Social(kind, pageUrl) {
  // kind: tiktok | instagram | fb | twitter
  const r = await axios.get(
    `https://api.bk9.dev/download/${kind}?url=${encodeURIComponent(pageUrl)}`,
    { timeout: TIMEOUT }
  );
  const payload = r.data?.BK9 ?? r.data;
  const url = pickCleanUrl(payload);
  if (!url) throw new Error('Could not extract media from that link. It may be private or invalid.');
  return { url: await validateDownloadUrl(url) };
}

function cleanName(s, ext) {
  return String(s || 'media').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) + ext;
}

module.exports = { ytSearch, ytAudio, ytVideo, apixAudio, apixVideo, bk9Social, firstMediaUrl, pickCleanUrl, collectMediaUrls, cleanName, isPublicIp, validateDownloadUrl, downloadBuffer };
