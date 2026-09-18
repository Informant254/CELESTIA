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

let yts = null;
try {
  yts = require('yt-search');
} catch {
  yts = null; // optional — API search is primary
}

const TIMEOUT = 60000;

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

async function ytAudio(videoUrl, fallbackTitle = 'YouTube Audio') {
  const errs = [];
  // 1) davidcyril (savetube CDN links — playable from anywhere)
  try {
    const r = await axios.get(
      `https://apis.davidcyriltech.my.id/download/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      { timeout: TIMEOUT }
    );
    const res = r.data?.result;
    if (r.data?.success && res?.download_url) {
      return { url: res.download_url, title: res.title || fallbackTitle };
    }
    throw new Error('no audio link');
  } catch (e) {
    errs.push('davidcyril: ' + (e.response?.status || e.message));
  }
  // 2) bk9 (googlevideo links — may be region/IP-locked, fallback only)
  try {
    const r = await axios.get(
      `https://api.bk9.dev/download/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      { timeout: TIMEOUT }
    );
    const b = r.data?.BK9;
    if (r.data?.status && b?.downloadUrl) {
      return { url: b.downloadUrl, title: b.title || fallbackTitle };
    }
    throw new Error('no audio link');
  } catch (e) {
    errs.push('bk9: ' + (e.response?.status || e.message));
  }
  throw new Error('Audio download failed (' + errs.join(' · ') + '). Try again later.');
}

async function ytVideo(videoUrl, fallbackTitle = 'YouTube Video') {
  try {
    const r = await axios.get(
      `https://apis.davidcyriltech.my.id/download/ytmp4?url=${encodeURIComponent(videoUrl)}`,
      { timeout: TIMEOUT }
    );
    const res = r.data?.result;
    if (r.data?.success && res?.download_url) {
      return { url: res.download_url, title: res.title || fallbackTitle, quality: res.quality || '' };
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
  return { url };
}

function cleanName(s, ext) {
  return String(s || 'media').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) + ext;
}

module.exports = { ytSearch, ytAudio, ytVideo, bk9Social, firstMediaUrl, pickCleanUrl, collectMediaUrls, cleanName };
