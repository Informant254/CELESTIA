/**
 * download/fallback.js — the SMART FALLBACK LOOP (silent).
 *
 * Strategies in order, first success wins, everything logged, user sees nothing.
 * Also: relevance-gated result fallback (never return unrelated media).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cfg = require('./config');
const ytdlp = require('./ytdlp');
const ffmpeg = require('./ffmpeg');
const { videoStrategies, audioStrategies } = require('./strategies');
const { classify, isRetryable } = require('./errors');
const logger = require('./logger');

const TERMINAL = new Set(['FILE_TOO_LARGE', 'DEPENDENCY_MISSING']);

// file exists · size>0 · not partial · inspectable · expected stream present
async function validateFile(file, isAudio) {
  if (!file || !fs.existsSync(file)) throw new Error('Validated: file missing after download.');
  const size = fs.statSync(file).size;
  if (!size) throw new Error('Validated: downloaded file was empty.');
  if (/\.(part|temp|tmp|ytdl)$/i.test(file)) throw new Error('Validated: incomplete temporary file.');
  let ss = [];
  try {
    ss = await ffmpeg.streams(file);
  } catch (e) {
    throw new Error('Validated: media inspection failed.');
  }
  const want = isAudio ? 'audio' : 'video';
  if (!ss.some((s) => s.codec_type === want)) {
    throw new Error(`Validated: no ${want} stream in file (FORMAT_ERROR).`);
  }
  logger.validate({ status: 'success', size: `${(size / 1048576).toFixed(1)}MB` });
  return size;
}

async function downloadWithFallback({ url, title, quality, isAudio, workDir, onProgress, maxBytes, tag }) {
  const strategies = isAudio ? audioStrategies() : videoStrategies(quality);
  let lastErr = null;

  for (const s of strategies) {
    try {
      const r = await ytdlp.attempt({
        url, selector: s.selector, extra: s.extra, audio: isAudio,
        workDir, onProgress, maxBytes,
      });
      await validateFile(r.file, isAudio);
      logger.download({ tag, strategy: s.name, status: 'success' });
      return { ...r, engine: 'yt-dlp', strategy: s.name };
    } catch (e) {
      lastErr = e;
      const cat = classify(e);
      logger.download({ tag, strategy: s.name, status: 'failed', reason: cat });
      if (TERMINAL.has(cat)) throw e;
      if (!isRetryable(e)) break;
      logger.fallback({ tag, from: s.name });
    }
  }

  // Tertiary: direct HTTP of an API-resolved URL (single attempt).
  if (lastErr && TERMINAL.has(classify(lastErr))) throw lastErr;
  try {
    logger.fallback({ tag, strategy: 'api-direct' });
    const api = require('../utils/downloader');
    const r = isAudio
      ? await api.ytAudio(url, title)
      : await api.ytVideo(url, title);
    const dl = await axios.get(r.url, { responseType: 'arraybuffer', timeout: 120000 });
    const buf = Buffer.from(dl.data);
    if (!buf.length) throw new Error('Fallback download was empty.');
    const file = path.join(workDir, isAudio ? 'out.mp3' : 'out.mp4');
    fs.writeFileSync(file, buf);
    await validateFile(file, isAudio);
    logger.download({ tag, strategy: 'api-direct', status: 'success' });
    return { file, size: buf.length, engine: 'api-direct', strategy: 'api-direct' };
  } catch (e2) {
    logger.download({ tag, strategy: 'api-direct', status: 'failed', reason: classify(e2) });
    throw e2;
  }
}

// --- relevance: is this fallback result actually what the user asked for? ---
const DROP_WORDS = new Set(['the', 'a', 'an', 'of', 'official', 'video', 'audio', 'hd', 'hq', 'mv', 'lyrics', 'lyric', 'on', 'and', 'vs', 'feat', 'ft']);
const LONG_HINT = new Set(['hour', 'hours', 'long', 'full', 'marathon', 'compilation', 'mix']);

function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !DROP_WORDS.has(w));
}

function relevance(query, cand) {
  const qw = words(query);
  const tw = words(cand.title);
  if (!qw.length || !tw.length) return 0;
  const tset = new Set(tw);
  const overlap = qw.filter((w) => tset.has(w)).length / qw.length;
  let score = overlap;
  const ql = String(query).toLowerCase();
  if (cand.channel && ql.includes(String(cand.channel).toLowerCase().split(' ')[0] || '')) score += 0.2;
  const longOk = [...LONG_HINT].some((h) => ql.includes(h));
  if (!longOk && cand.duration && cand.duration > 3600) score -= 0.3;
  return Math.min(1, Math.max(0, score));
}

function bestRelevant(query, candidates, triedUrls, maxPick = cfg.MAX_RESULT_FALLBACKS) {
  const scored = candidates
    .filter((c) => c.url && !triedUrls.has(c.url))
    .map((c) => ({ cand: c, score: relevance(query, c) }))
    .filter((s) => s.score >= 0.35)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, maxPick).map((s) => s.cand);
}

module.exports = { downloadWithFallback, validateFile, relevance, bestRelevant };
