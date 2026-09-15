/**
 * download/search.js — name-based search.
 * Primary: yt-dlp `ytsearchN:` (flat JSON). Fallback: API search.
 * Results cached (query -> list). No media touched here.
 */
const { execFile } = require('child_process');
const axios = require('axios');
const cfg = require('./config');
const { ensureYtDlp } = require('./engines');
const cache = require('./cache');
const { log } = require('./errors');

function secondsToClock(s) {
  if (s == null || isNaN(s)) return '—';
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function normalize(e) {
  const id = e.id || null;
  return {
    id,
    url: id ? `https://www.youtube.com/watch?v=${id}` : (e.url || e.webpage_url || null),
    title: e.title || 'Untitled',
    channel: e.uploader || e.channel || 'Unknown',
    duration: e.duration ?? null,
    durationText: secondsToClock(e.duration),
  };
}

function runYtDlpSearch(bin, query, n) {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      ['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch${n}:${query}`],
      { timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(((stderr || err.message) || '').trim().slice(0, 300)));
        const out = [];
        for (const line of String(stdout || '').split('\n')) {
          const t = line.trim();
          if (!t.startsWith('{')) continue;
          try {
            const e = JSON.parse(t);
            if (e && (e.id || e.url)) out.push(normalize(e));
          } catch { /* skip malformed line */ }
        }
        resolve(out);
      }
    );
  });
}

async function apiSearchFallback(query, n) {
  const r = await axios.get(
    `https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(query)}`,
    { timeout: 25000 }
  );
  const list = r.data?.data;
  if (!Array.isArray(list) || !list.length) throw new Error('no results');
  return list.slice(0, n).map((v) => ({
    id: v.videoId || null,
    url: v.url || (v.videoId ? `https://www.youtube.com/watch?v=${v.videoId}` : null),
    title: v.title || 'Untitled',
    channel: v.channel || v.author || 'Unknown',
    duration: null,
    durationText: '—',
  })).filter((v) => v.url);
}

async function search(query, tag) {
  const q = String(query || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, cfg.MAX_QUERY_LEN);
  if (!q) throw new Error('Empty search query.');
  const cached = cache.get(q);
  if (cached) {
    log('search-cache-hit', { tag, q: q.slice(0, 60) });
    return cached;
  }
  let results = [];
  let engine = 'yt-dlp';
  try {
    const bin = await ensureYtDlp();
    results = await runYtDlpSearch(bin, q, cfg.SEARCH_RESULTS);
    if (!results.length) throw new Error('no results');
  } catch (e1) {
    log('search-fallback', { tag, reason: String(e1.message).slice(0, 80) });
    engine = 'api';
    results = await apiSearchFallback(q, cfg.SEARCH_RESULTS);
  }
  if (!results.length) throw new Error('No results found.');
  cache.set(q, results);
  log('search', { tag, engine, q: q.slice(0, 60), hits: results.length });
  return results;
}

module.exports = { search, secondsToClock };
