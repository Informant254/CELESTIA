/**
 * autochat/memory.js — short-term per-chat conversation buffer (in-memory).
 * Last 12 exchanges per chat. Dies with the process — no disk trail.
 */
const CAP = 12;
const MAX_CHATS = 500;
const TTL_MS = 24 * 60 * 60 * 1000;

const buffers = new Map(); // chatId -> [{ role: 'them'|'me', text, ts }]

function prune(now = Date.now()) {
  const cutoff = now - TTL_MS;
  for (const [id, messages] of buffers) {
    const fresh = messages.filter((message) => message.ts >= cutoff);
    if (!fresh.length) buffers.delete(id);
    else if (fresh.length !== messages.length) buffers.set(id, fresh);
  }
  while (buffers.size > MAX_CHATS) buffers.delete(buffers.keys().next().value);
}

function push(chatId, role, text) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return;
  const now = Date.now();
  prune(now);
  if (!buffers.has(chatId)) buffers.set(chatId, []);
  const b = buffers.get(chatId);
  b.push({ role, text: t, ts: now });
  while (b.length > CAP) b.shift();
  buffers.delete(chatId);
  buffers.set(chatId, b);
  prune(now);
}

function get(chatId) {
  prune();
  const b = buffers.get(chatId);
  if (b) {
    buffers.delete(chatId);
    buffers.set(chatId, b);
  }
  return b ? [...b] : [];
}

function clear(chatId) {
  if (chatId) buffers.delete(chatId);
  else buffers.clear();
}

function format(chatId) {
  return get(chatId)
    .map((m) => `${m.role === 'me' ? 'YOU' : 'THEM'}: ${m.text}`)
    .join('\n');
}

module.exports = { push, get, clear, format };
