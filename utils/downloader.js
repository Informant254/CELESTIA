/**
 * utils/downloader.js — CELESTIA shared download sources.
 *
 *  SEARCH : siputzx  -> yt-search (npm fallback)
 *  AUDIO  : Keith (keyless) -> bk9 (keyless) -> davidcyril (optional key)
 *  VIDEO  : Keith (keyless) -> bk9 (keyless) -> davidcyril (optional key)
 *  SOCIAL : public resolver -> yt-dlp -> bk9 alternate extractors
 *
 * Every function resolves to { url, title } or throws a human-readable Error.
 */
const axios = require('axios');
const dns = require('dns').promises;
const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const path = require('path');
const cfg = require('../download/config');
const queue = require('../download/queue');

let yts = null;
try {
  yts = require('yt-search');
} catch {
  yts = null; // optional — API search is primary
}

// Fallback download APIs get a shorter fuse — a dead provider must fail
// fast so the next one gets its chance inside the job timeout.
const API_TIMEOUT = 30000;

// Keyless downloader backend used by ISAAC/BMW. Operators can override the
// base URL without changing code, but no API key is required by this client.
const KEITH_BASE = process.env.KEITH_BASE || 'https://apiskeith2-production-3679.up.railway.app';

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

function lookupPublicHost(host, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason || new Error('Download cancelled.'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      fn(value);
    };
    const onAbort = () => finish(reject, signal.reason || new Error('Download cancelled.'));
    const timer = setTimeout(() => finish(reject, new Error('Download hostname lookup timed out.')), 10000);
    if (timer.unref) timer.unref();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    dns.lookup(host, { all: true, verbatim: true }).then(
      (addresses) => finish(resolve, addresses),
      (error) => finish(reject, error)
    );
  });
}

async function resolveDownloadTarget(value, signal) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Provider returned an invalid download URL.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Provider returned an unsafe download URL.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host) ? [{ address: host }] : await lookupPublicHost(host, signal);
  if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Provider download URL resolves to a private or reserved address.');
  }
  return {
    url: parsed.toString(),
    hostname: host,
    addresses: addresses.map(({ address, family }) => ({ address, family: family || net.isIP(address) })),
  };
}

async function validateDownloadUrl(value, signal) {
  return (await resolveDownloadTarget(value, signal)).url;
}

function pinnedLookup(hostname, addresses) {
  return (requestedHost, options, callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const requested = String(requestedHost || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (requested !== hostname.toLowerCase()) {
      return callback(new Error('Download connection attempted an unexpected hostname.'));
    }
    const family = typeof options === 'number' ? options : Number(options?.family || 0);
    const eligible = family ? addresses.filter((entry) => entry.family === family) : addresses;
    if (!eligible.length) return callback(new Error('No validated address matches the requested IP family.'));
    if (typeof options === 'object' && options?.all) return callback(null, eligible);
    return callback(null, eligible[0].address, eligible[0].family);
  };
}

async function downloadBuffer(value, maxBytes, timeout = 120000, redirects = 5, signal) {
  const target = await resolveDownloadTarget(value, signal);
  const url = target.url;
  const lookup = pinnedLookup(target.hostname, target.addresses);
  const agent = target.url.startsWith('https:') ? new https.Agent({ lookup }) : new http.Agent({ lookup });
  const res = await axios.get(url, {
    responseType: 'stream', timeout, maxRedirects: 0,
    signal,
    proxy: false,
    ...(target.url.startsWith('https:') ? { httpsAgent: agent } : { httpAgent: agent }),
    validateStatus: (status) => status >= 200 && status < 400,
  });
  if (res.status >= 300) {
    res.data.resume();
    if (!res.headers.location || redirects <= 0) throw new Error('Too many or invalid download redirects.');
    const next = new URL(res.headers.location, url);
    if (new URL(url).protocol === 'https:' && next.protocol !== 'https:') {
      throw new Error('Provider attempted an insecure download redirect.');
    }
    return downloadBuffer(next.toString(), maxBytes, timeout, redirects - 1, signal);
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

async function downloadResolved(resolve, maxBytes, timeout = 120000, attempts = 2, signal) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (signal?.aborted) throw signal.reason || new Error('Download cancelled.');
    try {
      const media = await resolve();
      const buffer = await downloadBuffer(media.url, maxBytes, timeout, 5, signal);
      if (!buffer.length) throw new Error('Downloaded media was empty.');
      return { ...media, buffer };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
    }
  }
  throw lastError;
}

function detectMediaType(buffer, sourceUrl = '') {
  if (buffer?.length >= 12) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image';
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
    if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image';
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image';
    if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'video';
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'video';
  }
  if (/\.(jpe?g|png|gif|webp)(?:\?|$)/i.test(sourceUrl)) return 'image';
  if (/\.(mp4|mov|m4v|webm|mkv)(?:\?|$)/i.test(sourceUrl)) return 'video';
  return null;
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

async function keithMedia(kind, videoUrl, fallbackTitle, signal) {
  const endpoint = kind === 'audio' ? 'audio' : 'video';
  const r = await axios.get(
    `${KEITH_BASE}/download/${endpoint}?url=${encodeURIComponent(videoUrl)}`,
    { timeout: API_TIMEOUT, signal }
  );
  const mediaUrl = typeof r.data?.result === 'string' ? r.data.result : null;
  if (!mediaUrl) {
    throw new Error(r.data?.error || r.data?.message || 'Keith returned no media link');
  }
  return {
    url: await validateDownloadUrl(mediaUrl, signal),
    title: r.data?.title || fallbackTitle,
  };
}

async function keithAudio(videoUrl, fallbackTitle = 'YouTube Audio', signal) {
  try {
    return await keithMedia('audio', videoUrl, fallbackTitle, signal);
  } catch (e) {
    throw new Error('Keith audio failed (' + (e.response?.status || e.message) + ').');
  }
}

async function keithVideo(videoUrl, fallbackTitle = 'YouTube Video', signal) {
  try {
    return await keithMedia('video', videoUrl, fallbackTitle, signal);
  } catch (e) {
    throw new Error('Keith video failed (' + (e.response?.status || e.message) + ').');
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
async function apixMedia(kind, videoUrl, fallbackTitle, signal) {
  const key = apixKey();
  if (!key) throw new Error('no Apix key configured');
  const r = await axios.get(
    `${APIX_BASE}/api/download/youtube/${kind}?url=${encodeURIComponent(videoUrl)}&key=${encodeURIComponent(key)}`,
    { timeout: API_TIMEOUT, signal }
  );
  const url = r.data?.downloadUrl || r.data?.proxyUrl;
  if (r.data?.success && url) {
    const fileUrl = url.includes('key=') ? url : url + `&key=${encodeURIComponent(key)}`;
    return { url: await validateDownloadUrl(fileUrl, signal), title: r.data?.title || fallbackTitle };
  }
  throw new Error(r.data?.error || 'no media link');
}

async function apixAudio(videoUrl, fallbackTitle = 'YouTube Audio', signal) {
  try {
    return await apixMedia('mp3', videoUrl, fallbackTitle, signal);
  } catch (e) {
    throw new Error('Apix audio failed (' + (e.response?.status || e.message) + ').');
  }
}

async function apixVideo(videoUrl, fallbackTitle = 'YouTube Video', signal) {
  try {
    return await apixMedia('mp4', videoUrl, fallbackTitle, signal);
  } catch (e) {
    throw new Error('Apix video failed (' + (e.response?.status || e.message) + ').');
  }
}

async function ytAudio(videoUrl, fallbackTitle = 'YouTube Audio', signal) {
  const errs = [];

  // 1) Keith first — no API key required by the client.
  try {
    return await keithAudio(videoUrl, fallbackTitle, signal);
  } catch (e) {
    if (signal?.aborted) throw signal.reason || e;
    errs.push('keith: ' + (e.response?.status || e.message));
  }

  // 2) bk9 — keyless and links generally stream cross-network.
  try {
    const r = await axios.get(
      `https://api.bk9.dev/download/ytmp3?url=${encodeURIComponent(videoUrl)}`,
      { timeout: API_TIMEOUT, signal }
    );
    const b = r.data?.BK9;
    if (r.data?.status && b?.downloadUrl) {
      return { url: await validateDownloadUrl(b.downloadUrl, signal), title: b.title || fallbackTitle };
    }
    throw new Error('no audio link');
  } catch (e) {
    if (signal?.aborted) throw signal.reason || e;
    errs.push('bk9: ' + (e.response?.status || e.message));
  }

  // 3) davidcyril is optional and is never contacted without an owner key.
  if (process.env.DAVIDCYRIL_APIKEY) {
    try {
      const r = await axios.get(dcUrl('ytmp3', videoUrl), { timeout: API_TIMEOUT, signal });
      const res = r.data?.result;
      if (r.data?.success && res?.download_url) {
        return { url: await validateDownloadUrl(res.download_url, signal), title: res.title || fallbackTitle };
      }
      throw new Error('no audio link');
    } catch (e) {
      if (signal?.aborted) throw signal.reason || e;
      errs.push('davidcyril: ' + (e.response?.status || e.message));
    }
  }
  throw new Error('Audio download failed (' + errs.join(' · ') + '). Try again later.');
}

async function ytVideo(videoUrl, fallbackTitle = 'YouTube Video', signal) {
  const errs = [];

  // 1) Keith first — no API key required by the client.
  try {
    return await keithVideo(videoUrl, fallbackTitle, signal);
  } catch (e) {
    if (signal?.aborted) throw signal.reason || e;
    errs.push('keith: ' + (e.response?.status || e.message));
  }

  // 2) BK9 remains a keyless fallback.
  try {
    const r = await axios.get(
      `https://api.bk9.dev/download/youtube?url=${encodeURIComponent(videoUrl)}&quality=480p&type=video`,
      { timeout: API_TIMEOUT, signal }
    );
    const result = r.data?.BK9 ?? r.data;
    const url = pickCleanUrl(result);
    if (r.data?.status && url) {
      return {
        url: await validateDownloadUrl(url, signal),
        title: result?.filename?.replace(/\.mp4$/i, '') || fallbackTitle,
        quality: result?.quality || '480p',
      };
    }
    throw new Error('no video link');
  } catch (e) {
    if (signal?.aborted) throw signal.reason || e;
    errs.push('bk9: ' + (e.response?.status || e.message));
  }

  // 3) davidcyril is optional and is never contacted without an owner key.
  if (process.env.DAVIDCYRIL_APIKEY) {
    try {
      const r = await axios.get(dcUrl('ytmp4', videoUrl), { timeout: API_TIMEOUT, signal });
      const res = r.data?.result;
      if (r.data?.success && res?.download_url) {
        return { url: await validateDownloadUrl(res.download_url, signal), title: res.title || fallbackTitle, quality: res.quality || '' };
      }
      throw new Error(res?.message || 'no video link');
    } catch (e) {
      if (signal?.aborted) throw signal.reason || e;
      errs.push('davidcyril: ' + (e.response?.status || e.message));
    }
  }
  throw new Error('Video download failed (' + errs.join(' · ') + '). Try again later.');
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

async function bk9Social(kind, pageUrl, signal) {
  const routes = {
    tiktok: ['tiktok', 'tiktok2', 'tiktok3'],
    instagram: ['instagram', 'instagram2', 'instagram3', 'instagram4'],
    fb: ['fb', 'fb2'],
    twitter: ['twitter', 'twitter-2'],
  }[kind];
  if (!routes) throw new Error(`Unsupported social downloader: ${kind}`);

  const errors = [];
  for (const route of routes) {
    try {
      const r = await axios.get(
        `https://api.bk9.dev/download/${route}?url=${encodeURIComponent(pageUrl)}`,
        { timeout: API_TIMEOUT, signal }
      );
      const payload = r.data?.BK9 ?? r.data?.result ?? r.data;
      const url = pickCleanUrl(payload);
      if (!url) throw new Error('no media link');
      return { url: await validateDownloadUrl(url, signal) };
    } catch (error) {
      if (signal?.aborted) throw signal.reason || new Error('Download cancelled.');
      errors.push(`${route}: ${error.response?.status || error.message}`);
    }
  }
  throw new Error(`Could not extract media from that link (${errors.join(' · ')}).`);
}

const SOCIAL_HOSTS = {
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com'],
  fb: ['facebook.com', 'fb.watch'],
  twitter: ['twitter.com', 'x.com'],
};

const YOUTUBE_HOSTS = ['youtube.com', 'youtu.be'];

function validateYoutubePageUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Send a valid YouTube link.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Send a safe public YouTube link.');
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!YOUTUBE_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error('That link is not a supported YouTube URL.');
  }
  return parsed.toString();
}

function validateSocialPageUrl(kind, value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Send a valid social-media link.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Send a safe public social-media link.');
  }
  const allowed = SOCIAL_HOSTS[kind];
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!allowed || !allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error(`That link is not a supported ${kind} URL.`);
  }
  return parsed.toString();
}

async function publicSocial(kind, pageUrl, signal) {
  if (kind === 'tiktok') {
    const r = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}`, { timeout: API_TIMEOUT, signal });
    const url = r.data?.data?.play;
    if (!url) throw new Error('TikWM returned no media link.');
    return { url: await validateDownloadUrl(url, signal), type: 'video', provider: 'tikwm' };
  }
  if (kind === 'twitter') {
    const id = new URL(pageUrl).pathname.match(/\/status\/(\d+)/)?.[1];
    if (!id) throw new Error('Could not find a post ID in that X link.');
    const r = await axios.get(`https://api.fxtwitter.com/i/status/${id}`, {
      timeout: API_TIMEOUT,
      signal,
      headers: { 'User-Agent': 'CELESTIA-Bot/2.0' },
    });
    const media = r.data?.tweet?.media;
    const hit = media?.videos?.[0]?.url || media?.photos?.[0]?.url;
    if (!hit) throw new Error('FxTwitter returned no downloadable media.');
    return {
      url: await validateDownloadUrl(hit, signal),
      type: media?.videos?.length ? 'video' : 'image',
      provider: 'fxtwitter',
    };
  }
  throw new Error(`No dedicated public resolver for ${kind}.`);
}

async function localSocial(pageUrl, maxBytes, signal) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-social-'));
  try {
    const ytdlp = require('../download/ytdlp');
    const fallback = require('../download/fallback');
    const result = await ytdlp.attempt({
      url: pageUrl,
      selector: 'bv*[height<=720]+ba/b[height<=720]/b',
      workDir,
      maxBytes,
      youtube: false,
      signal,
    });
    await fallback.validateFile(result.file, false);
    const buffer = fs.readFileSync(result.file);
    if (buffer.length > maxBytes) throw new Error('Social video exceeds the configured size limit.');
    return { url: pageUrl, buffer, type: 'video', provider: 'yt-dlp' };
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}

async function resolvedSocial(provider, resolver, maxBytes, signal) {
  const result = await downloadResolved(resolver, maxBytes, 120000, 1, signal);
  const type = result.type || detectMediaType(result.buffer, result.url);
  if (!type) throw new Error(`${provider} returned data that was not recognized as media.`);
  return { ...result, type, provider: result.provider || provider };
}

async function downloadSocial(kind, pageUrl, maxBytes = cfg.MAX_VIDEO_BYTES, owner = null, consume = null) {
  const safeUrl = validateSocialPageUrl(kind, pageUrl);
  const run = async (signal) => {
    const providers = [];
    if (kind === 'tiktok' || kind === 'twitter') {
      providers.push(['public', () => resolvedSocial('public', () => publicSocial(kind, safeUrl, signal), maxBytes, signal)]);
    }
    providers.push(['yt-dlp', () => localSocial(safeUrl, maxBytes, signal)]);
    providers.push(['bk9', () => resolvedSocial('bk9', () => bk9Social(kind, safeUrl, signal), maxBytes, signal)]);
    const errors = [];
    for (const [name, provider] of providers) {
      if (signal.aborted) throw signal.reason;
      try {
        return await provider();
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        errors.push(`${name}: ${String(error.message || error).slice(0, 100)}`);
      }
    }
    throw new Error(`All keyless download providers failed (${errors.join(' · ')}).`);
  };

  const queued = await queue.run(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Overall request timeout exceeded (TIMEOUT).')), cfg.DOWNLOAD_TIMEOUT_MS);
    if (timeout.unref) timeout.unref();
    try {
      const result = await run(controller.signal);
      return { value: consume ? await consume(result) : result };
    } finally {
      clearTimeout(timeout);
    }
  }, owner);
  return queued.value;
}

async function downloadYoutube(videoUrl, title, isAudio, maxBytes, quality, owner = null, consume = null) {
  const safeUrl = validateYoutubePageUrl(videoUrl);
  const queued = await queue.run(async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-youtube-'));
    let timeoutHandle;
    const controller = new AbortController();
    try {
      timeoutHandle = setTimeout(() => {
        const error = new Error('Overall request timeout exceeded (TIMEOUT).');
        controller.abort(error);
        try { require('../download/ytdlp').abortDir(workDir); } catch { /* best effort */ }
      }, cfg.DOWNLOAD_TIMEOUT_MS);
      if (timeoutHandle.unref) timeoutHandle.unref();
      const fallback = require('../download/fallback');
      const result = await fallback.downloadWithFallback({
        url: safeUrl,
        title,
        quality,
        isAudio,
        workDir,
        maxBytes,
        tag: 'legacy',
        signal: controller.signal,
      });
      const media = { ...result, title, buffer: fs.readFileSync(result.file) };
      return { value: consume ? await consume(media) : media };
    } finally {
      clearTimeout(timeoutHandle);
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  }, owner);
  return queued.value;
}

function downloadYoutubeAudio(videoUrl, title = 'YouTube Audio', maxBytes = cfg.MAX_AUDIO_BYTES, owner = null, consume = null) {
  return downloadYoutube(videoUrl, title, true, maxBytes, undefined, owner, consume);
}

function downloadYoutubeVideo(videoUrl, title = 'YouTube Video', maxBytes = cfg.MAX_VIDEO_BYTES, owner = null, consume = null) {
  return downloadYoutube(videoUrl, title, false, maxBytes, { n: 4, label: '480p', kind: 'video', height: 480 }, owner, consume);
}

function cleanName(s, ext) {
  return String(s || 'media').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) + ext;
}

module.exports = {
  ytSearch, ytAudio, ytVideo, keithAudio, keithVideo, apixAudio, apixVideo,
  bk9Social, publicSocial, localSocial, downloadSocial, downloadResolved, downloadBuffer, detectMediaType,
  downloadYoutubeAudio, downloadYoutubeVideo,
  firstMediaUrl, pickCleanUrl, collectMediaUrls, cleanName, isPublicIp, validateDownloadUrl, validateSocialPageUrl, validateYoutubePageUrl,
};
