/**
 * download/sessions.js — per-user/per-chat search sessions with expiry.
 *
 * A session: { chatId, senderId, kind, query, quality, results, createdAt }
 * Single-shot: a pick drops the session, so a number can never fire twice.
 * A selection only resolves against the session owned by that exact
 * chat+sender pair — one user's "2" can never trigger another user's job.
 */
const cfg = require('./config');

const sessions = new Map(); // `${chatId}::${senderId}` -> session

function key(chatId, senderId) {
  return `${chatId}::${senderId}`;
}

function create({ chatId, senderId, kind, query, quality, results }) {
  const s = { chatId, senderId, kind, query, quality, results: results || [], createdAt: Date.now() };
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
//  { session, pick }   valid selection
//  { expired: true }   session timed out
//  { session, invalid } out of range
//  null                no session — message is not ours
function resolve(chatId, senderId, text) {
  const t = String(text || '').trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const s = get(chatId, senderId);
  if (!s) return null;
  if (s.expired) return { expired: true };
  const n = parseInt(t, 10);
  if (n < 1 || n > s.results.length) return { session: s, invalid: true };
  return { session: s, pick: s.results[n - 1] };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) {
    if (now - s.createdAt > cfg.SESSION_TTL_MS) sessions.delete(k);
  }
}, 60 * 1000).unref?.();

module.exports = { create, get, drop, count, resolve };
