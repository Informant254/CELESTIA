/**
 * download/errors.js — failure classification, user messages, structured logs.
 *
 * Never show raw stack traces to users. Technical detail goes to console.
 */
const cfg = require('./config');

function senderTag(chatId, senderId) {
  const tail = String(senderId || '').split('@')[0].slice(-4) || '????';
  const where = String(chatId || '').endsWith('@g.us') ? 'group' : 'dm';
  return `${where}:…${tail}`;
}

function log(tag, fields) {
  const ts = new Date().toISOString();
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[DL] ${ts} ${tag} ${parts.join(' ')}`);
}

// Classify a raw failure into a stable category.
function classify(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  if (/ffmpeg_missing|ffprobe_missing/.test(m)) return 'ffmpeg-missing';
  if (/sign in to confirm|bot.*check|confirm you.?re not a bot/.test(m)) return 'bot-check';
  if (/private|login|cookies|age.*confirm|age-gated|drm/.test(m)) return 'restricted';
  if (/unavailable|removed|deleted|404|not found|no video|no results/.test(m)) return 'unavailable';
  if (/too large|exceed|file size|requested format not available|requested quality/.test(m)) return 'quality';
  if (/timed out|timeout|econn|enotfound|eai_again|socket|network|503|502|500/.test(m)) return 'network';
  if (/expired|no session|session/.test(m)) return 'session';
  return 'unknown';
}

const USER_REASONS = {
  'bot-check': 'Platform temporarily blocked automated downloads',
  'restricted': 'Result is private / age-gated / DRM-protected',
  'unavailable': 'Result is unavailable or was removed',
  'quality': 'Requested quality unavailable or file is too large',
  'network': 'Network error / download server failed',
  'ffmpeg-missing': 'Media processor (FFmpeg) unavailable — admin needed',
  'session': 'Search expired — search again',
  'unknown': 'Unexpected error',
};

function userMessage(err, action = 'DOWNLOAD FAILED') {
  const cat = classify(err);
  const detail = (err && err.userDetail) || USER_REASONS[cat] || USER_REASONS.unknown;
  return `❌ *${action}*\n\nPossible reason:\n• ${detail}\n\n_Try again, or pick another result._`;
}

module.exports = { classify, userMessage, log, senderTag, USER_REASONS };
