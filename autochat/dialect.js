/**
 * autochat/dialect.js — per-chat street-language memory.
 * Harvests the CONTACT's own distinctive lines (their Sheng, their slang)
 * so she mirrors whoever she's talking to — no teaching required.
 * Persisted per chat (cap 20 lines, 40 chats), pruned automatically.
 */
const settingsStore = require('../utils/settingsStore');

const KEY = 'autochat_dialect';
const PER_CHAT = 20;
const MAX_CHATS = 40;

function all() {
  const v = settingsStore.get(KEY, {});
  return v && typeof v === 'object' ? v : {};
}

function save(v) {
  try {
    const chats = Object.keys(v);
    while (chats.length > MAX_CHATS) {
      delete v[chats.shift()];
    }
    settingsStore.set(KEY, v);
  } catch { /* never break chat */ }
}

// A line worth borrowing: real words, not a command/link/number.
function keepable(text) {
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 200) return false;
  if (/^[./!#]/.test(t)) return false;
  if (/https?:\/\//.test(t)) return false;
  if (/^\d{1,3}$/.test(t)) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  return true;
}

function harvest(chatId, text) {
  const t = String(text || '').trim();
  if (!keepable(t)) return false;
  const v = all();
  if (!v[chatId]) v[chatId] = [];
  if (v[chatId].includes(t)) return false;
  v[chatId].push(t);
  while (v[chatId].length > PER_CHAT) v[chatId].shift();
  save(v);
  return true;
}

function block(chatId) {
  const v = all();
  const lines = (v[chatId] || []).slice(-10);
  if (!lines.length) return '';
  return [
    'THEIR street language in this chat (mirror it — these are THEIR words, use them back like you grew up together, never force it):',
    ...lines.map((l) => `- "${l.slice(0, 80)}"`),
  ].join('\n');
}

function count(chatId) {
  const v = all();
  if (chatId) return (v[chatId] || []).length;
  return Object.keys(v).length;
}

module.exports = { harvest, block, count, keepable };
