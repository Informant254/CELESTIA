// Cookie jars are credentials. Keep them in persistent data, not in images or logs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_BYTES = 256 * 1024;
const AUTH_COOKIE = /^(?:SID|HSID|SSID|APISID|SAPISID|LOGIN_INFO|__Secure-(?:1P|3P)(?:SID(?:TS|CC)?|APISID))$/;
const rejected = new Set();
let pending;
let lastAttempt = 0;
let lastSource = '';
let lastRefresh = 'not requested';
let writing = Promise.resolve();

function destination() {
  return path.resolve(process.env.YOUTUBE_COOKIES_FILE || path.join('data', 'youtube-cookies.txt'));
}

function parseJar(value, now = Date.now()) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Cookie file must be between 1 byte and 256 KB.');
  const auth = [];
  let count = 0;
  for (let line of buffer.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (line.startsWith('#HttpOnly_')) line = line.slice(10);
    else if (!line.trim() || line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (fields.length !== 7 || !/^\d+$/.test(fields[4])) throw new Error('Use a Netscape cookies.txt export, not a browser Cookie header.');
    const domain = fields[0].replace(/^\./, '').toLowerCase();
    if (!['youtube.com', 'google.com'].some(host => domain === host || domain.endsWith(`.${host}`))) continue;
    count++;
    if (AUTH_COOKIE.test(fields[5]) && fields[6]) auth.push(Number(fields[4]) * 1000);
  }
  if (!count || !auth.length) throw new Error('The file contains no signed-in YouTube/Google cookies.');
  const live = auth.filter(expiry => expiry === 0 || expiry > now);
  return {
    usable: live.length > 0,
    expiresAt: live.some(expiry => expiry === 0) ? null : live.length ? Math.min(...live) : Math.max(...auth),
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function inspect() {
  const files = process.env.YOUTUBE_COOKIES_FILE
    ? [destination()]
    : [destination(), path.resolve('cookies', 'youtube.txt')];
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > MAX_BYTES) return { exists: true, usable: false, state: 'invalid' };
      const jar = parseJar(fs.readFileSync(file));
      return { ...jar, file, exists: true, state: rejected.has(jar.hash) ? 'rejected' : jar.usable ? 'ready' : 'expired' };
    } catch (error) {
      if (error.code !== 'ENOENT') return { exists: true, usable: false, state: 'invalid' };
    }
  }
  return { exists: false, usable: false, state: 'missing' };
}

function cookieFile() {
  const jar = inspect();
  return jar.state === 'ready' ? jar.file : null;
}

async function store(value, file = destination(), options = {}) {
  if (process.env.YOUTUBE_COOKIES_READ_ONLY === 'true') throw new Error('The shared cookie file is managed by the main bot.');
  const jar = parseJar(value);
  if (!jar.usable) throw new Error('These YouTube cookies have expired. Export a fresh signed-in session.');
  const job = writing.then(async () => {
    if (Object.hasOwn(options, 'expectedHash') && inspect().hash !== options.expectedHash) return null;
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, value, { mode: 0o600, flag: 'wx' });
      await fs.promises.rename(temporary, file);
    } finally { await fs.promises.rm(temporary, { force: true }); }
    rejected.delete(jar.hash);
    return jar;
  });
  writing = job.catch(() => {});
  return job;
}

function sourceUrl() {
  const raw = String(process.env.YOUTUBE_COOKIES_URL || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return url.toString();
  } catch { throw new Error('YOUTUBE_COOKIES_URL must be an HTTPS URL without embedded credentials.'); }
}

async function refresh({ signal, force = false } = {}) {
  if (process.env.YOUTUBE_COOKIES_READ_ONLY === 'true') return { configured: false, updated: false, sharedReadOnly: true };
  const source = sourceUrl();
  if (!source) return { configured: false, updated: false };
  if (pending) return pending;
  if (lastSource !== source) { lastAttempt = 0; lastSource = source; }
  const interval = Math.max(60, Number(process.env.YOUTUBE_COOKIES_REFRESH_SECONDS) || 1800) * 1000;
  const current = inspect();
  if (lastAttempt && Date.now() - lastAttempt < (force || current.state !== 'ready' ? 60000 : interval)) {
    return { configured: true, updated: false, cooldown: true };
  }
  lastAttempt = Date.now();
  pending = (async () => {
    try {
      // Lazy import avoids a ytdlp -> downloader -> ytdlp dependency cycle.
      const { downloadBuffer } = require('../utils/downloader');
      const buffer = await downloadBuffer(source, MAX_BYTES, 10000, 3, signal);
      const next = parseJar(buffer);
      if (!next.usable) throw new Error('The refresh source returned expired cookies.');
      if (next.hash === current.hash) {
        lastRefresh = 'source unchanged';
        return { configured: true, updated: false };
      }
      // A manual upload made while the request was in flight wins.
      if (inspect().hash !== current.hash) return { configured: true, updated: false };
      if (!await store(buffer, destination(), { expectedHash: current.hash })) return { configured: true, updated: false };
      lastRefresh = 'updated';
      return { configured: true, updated: true };
    } catch {
      // Do not expose credential-bearing source URLs, response bodies or cookies.
      lastRefresh = 'refresh failed';
      if (signal?.aborted) throw signal.reason;
      return { configured: true, updated: false, failed: true };
    }
  })();
  try { return await pending; } finally { pending = null; }
}

async function prepare(signal) {
  await refresh({ signal });
  return cookieFile();
}

function snapshot(workDir) {
  const jar = inspect();
  if (jar.state !== 'ready') return null;
  const buffer = fs.readFileSync(jar.file);
  // Recheck the bytes actually copied if an operator replaced the source meanwhile.
  const copied = parseJar(buffer);
  if (!copied.usable || rejected.has(copied.hash)) return null;
  const file = path.join(workDir, 'youtube-cookies.txt');
  fs.writeFileSync(file, buffer, { mode: 0o600 });
  return { file, source: jar.file, hash: copied.hash };
}

async function saveUpdated(snapshot) {
  if (!snapshot || process.env.YOUTUBE_COOKIES_READ_ONLY === 'true') return;
  try {
    if (inspect().hash !== snapshot.hash) return;
    const buffer = await fs.promises.readFile(snapshot.file);
    const next = parseJar(buffer);
    if (next.usable && next.hash !== snapshot.hash) await store(buffer, snapshot.source, { expectedHash: snapshot.hash });
  } catch { /* Cookie persistence must not turn a successful media download into a failure. */ }
}

function reject(hash) {
  if (!hash) return;
  if (rejected.size >= 32) rejected.clear();
  rejected.add(hash);
}

function authFailure(error) {
  return /cookies?.*(?:expired|invalid|no longer valid)|sign in to confirm|sign in.*not a bot|login required|authentication required/i.test(error?.message || '');
}

function status() {
  const jar = inspect();
  return {
    state: jar.state, expiresAt: jar.expiresAt ?? null,
    automaticSource: Boolean(process.env.YOUTUBE_COOKIES_URL), lastRefresh,
    shared: process.env.YOUTUBE_COOKIES_SHARED === 'true',
    readOnly: process.env.YOUTUBE_COOKIES_READ_ONLY === 'true',
  };
}

module.exports = { MAX_BYTES, parseJar, inspect, cookieFile, store, refresh, prepare, snapshot, saveUpdated, reject, authFailure, status };
