/**
 * download/sessions.js — per-user/per-chat search sessions with expiry.
 *
 * A session: { chatId, senderId, kind: 'video'|'audio', query, results,
 *              stage: 'results'|'quality', picked, statusKey, createdAt }
 *
 * A selection only ever resolves against the session owned by that exact
 * chat+sender pair — one user's "2" can never trigger another user's job.
 */
const cfg = require('./config');

const sessions = new Map(); // `${chatId}::${senderId}` -> session

function key(chatId, senderId) {
  return `${chatId}::${senderId}`;
}

function create({ chatId, senderId, kind, query, results, statusKey }) {
  const s = {
    chatId, senderId, kind, query,
    results: results || [],
    stage: 'results',
    picked: null,
    statusKey: statusKey || null,
    createdAt: Date.now(),
  };
  sessions.set(key(chatId, senderId), s);
  return s;
}

function get(chatId, senderId) {
  const s = sessions.get(key(chatId, senderId));
  if (!s) return null;
  if (Date.now() - s.createdAt > cfg.SESSION_TTL_MS) {
    sessions.delete(key(chatId, senderId));
    return { expired: true };
  }
  return s;
}

function drop(chatId, senderId) {
  sessions.delete(key(chatId, senderId));
}

function count() {
  return sessions.size;
}

// Resolve a bare-number message. Returns:
//  { session, pick }            valid selection (session advanced or dropped)
//  { expired: true }            session existed but timed out
//  null                         no session — message is not ours
function resolve(chatId, senderId, text) {
  const t = String(text || '').trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const s = get(chatId, senderId);
  if (!s) return null;
  if (s.expired) return { expired: true };
  const n = parseInt(t, 10);
  if (s.stage === 'results') {
    if (n < 1 || n > s.results.length) return { session: s, invalid: true };
    s.picked = s.results[n - 1];
    s.stage = 'quality';
    s.createdAt = Date.now(); // refresh for the quality step
    return { session: s, pick: s.picked };
  }
  if (s.stage === 'quality') {
    if (n < 1 || n > 6) return { session: s, invalid: true };
    return { session: s, quality: n };
  }
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.createdAt > cfg.SESSION_TTL_MS) sessions.delete(k);
  }
}, 60 * 1000).unref?.();

module.exports = { create, get, drop, count, resolve };
