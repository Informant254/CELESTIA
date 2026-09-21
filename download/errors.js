/**
 * download/errors.js — smart failure classification + user messages.
 *
 * Categories: NETWORK_ERROR, RATE_LIMITED, YOUTUBE_BLOCKED, EXTRACTOR_ERROR, FORMAT_ERROR, FFMPEG_ERROR,
 * FILE_TOO_LARGE, UNAVAILABLE_MEDIA, TIMEOUT, DEPENDENCY_MISSING, UNKNOWN_ERROR.
 *
 * Internals stay in logs. Users only ever see the final friendly message.
 */
function senderTag(chatId, senderId) {
  const tail = String(senderId || '').split('@')[0].slice(-4) || '????';
  const where = String(chatId || '').endsWith('@g.us') ? 'group' : 'dm';
  return `${where}:…${tail}`;
}

function classify(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  if (/ffmpeg_missing|ffprobe_missing|dependency/.test(m)) return 'DEPENDENCY_MISSING';
  if (/too large|max-filesize|exceeds.*cap|over the .* limit/.test(m)) return 'FILE_TOO_LARGE';
  if (/timed out|timeout|overall time budget/.test(m)) return 'TIMEOUT';
  if (/http error 429|status code 429|too many requests|rate.?limit/.test(m)) return 'RATE_LIMITED';
  if (/http error 403|status code 403|sign in to confirm|not a bot|bot.*check/.test(m)) return 'YOUTUBE_BLOCKED';
  if (/private|login|cookies|age.*gate|drm|paywall/.test(m)) return 'UNAVAILABLE_MEDIA';
  if (/unavailable|removed|deleted|404|not found|no video|no results|empty/.test(m)) return 'UNAVAILABLE_MEDIA';
  if (/requested format|requested quality|format not available|no file|extraction/.test(m)) return 'FORMAT_ERROR';
  if (/ffmpeg|ffprobe|merge|libx264|libmp3lame|conversion failed|inspection failed/.test(m)) return 'FFMPEG_ERROR';
  if (/econn|enotfound|eai_again|socket|network|5\d\d|econnreset|econnaborted/.test(m)) return 'NETWORK_ERROR';
  return 'UNKNOWN_ERROR';
}

// Whether another strategy deserves a chance. Budgets cap everything anyway.
const RETRYABLE = {
  NETWORK_ERROR: true,
  TIMEOUT: true,
  FORMAT_ERROR: true,
  EXTRACTOR_ERROR: true,
  FFMPEG_ERROR: true,
  UNKNOWN_ERROR: true,
  RATE_LIMITED: false,
  YOUTUBE_BLOCKED: false,
  FILE_TOO_LARGE: false,
  UNAVAILABLE_MEDIA: false,
  DEPENDENCY_MISSING: false,
};

function isRetryable(err) {
  return RETRYABLE[classify(err)] !== false;
}

function userMessage(err) {
  const cat = classify(err);
  if (cat === 'FILE_TOO_LARGE') {
    const detail = (err && err.userDetail) || 'That file is too large for WhatsApp — try Audio or a shorter video.';
    return `> ╭─❏ *FILE TOO LARGE* ❏\n> │ • ${detail}\n> ╰─────────────────`;
  }
  if (cat === 'DEPENDENCY_MISSING') {
    return '> ╭─❏ *DOWNLOADER OFFLINE* ❏\n> │ • A media engine is missing — the admin has been notified.\n> ╰─────────────────';
  }
  return "❌ I couldn't download that media right now.\n\nTry another title or try again later.";
}

module.exports = { classify, isRetryable, userMessage, senderTag, RETRYABLE };
