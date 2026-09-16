/**
 * autochat/memory.js — short-term per-chat conversation buffer (in-memory).
 * Last 12 exchanges per chat. Dies with the process — no disk trail.
 */
const CAP = 12;

const buffers = new Map(); // chatId -> [{ role: 'them'|'me', text, ts }]

function push(chatId, role, text) {
  const t = String(text || '').trim().slice(0, 500);
  if (!t) return;
  if (!buffers.has(chatId)) buffers.set(chatId, []);
  const b = buffers.get(chatId);
  b.push({ role, text: t, ts: Date.now() });
  while (b.length > CAP) b.shift();
}

function get(chatId) {
  const b = buffers.get(chatId);
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
