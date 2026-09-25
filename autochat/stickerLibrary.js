const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settingsStore = require('../utils/settingsStore');

const ROOT = process.env.STICKER_LIBRARY_DIR || path.join(__dirname, '../data/autochat-stickers');
const INDEX = path.join(ROOT, 'index.json');
const ENABLED_KEY = 'autochat_sticker_chats';
const cooldowns = new Map();

function normalizeMood(value) {
  return String(value || 'random').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'random';
}

function load() {
  try {
    const value = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveIndex(entries) {
  fs.mkdirSync(ROOT, { recursive: true });
  const temp = `${INDEX}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(entries, null, 2));
  fs.renameSync(temp, INDEX);
}

function add(buffer, mood) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('empty sticker');
  if (buffer.length > 2 * 1024 * 1024) throw new Error('sticker is larger than 2 MB');
  fs.mkdirSync(ROOT, { recursive: true });
  const id = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const entries = load();
  const existing = entries.find((entry) => entry.id === id);
  if (existing) {
    existing.mood = normalizeMood(mood);
    saveIndex(entries);
    return { entry: existing, duplicate: true };
  }
  const entry = { id, mood: normalizeMood(mood), file: `${id}.webp`, createdAt: Date.now() };
  fs.writeFileSync(path.join(ROOT, entry.file), buffer);
  entries.push(entry);
  saveIndex(entries);
  return { entry, duplicate: false };
}

function list() {
  return load().filter((entry) => {
    try { return fs.statSync(path.join(ROOT, entry.file)).isFile(); } catch { return false; }
  });
}

function remove(selector) {
  const entries = load();
  const number = /^\d+$/.test(String(selector || '')) ? Number(selector) : 0;
  const entry = number >= 1 && number <= entries.length
    ? entries[number - 1]
    : entries.find((item) => item.id === selector || item.id.startsWith(String(selector || '')));
  if (!entry) return null;
  try { fs.unlinkSync(path.join(ROOT, entry.file)); } catch {}
  saveIndex(entries.filter((item) => item.id !== entry.id));
  return entry;
}

function enabledChats() {
  const value = settingsStore.get(ENABLED_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isEnabled(chatId) {
  return enabledChats()[chatId] === true;
}

function setEnabled(chatId, enabled) {
  settingsStore.set(ENABLED_KEY, { ...enabledChats(), [chatId]: enabled === true });
}

function detectMood(text, available = list()) {
  const input = String(text || '').toLowerCase();
  const labels = [...new Set(available.map((entry) => entry.mood))];
  const exact = labels.find((label) => label !== 'random' && input.includes(label.replace(/[_-]/g, ' ')));
  if (exact) return exact;
  const groups = [
    ['love', /\b(love|babe|baby|darling|heart|miss you|kiss|romance)\b/],
    ['happy', /\b(happy|great|nice|awesome|good news|congrats|lol|lmao|haha)\b/],
    ['sad', /\b(sad|sorry|hurt|cry|miss|lonely|bad news)\b/],
    ['angry', /\b(angry|mad|annoyed|hate|seriously|wtf)\b/],
    ['hello', /\b(hello|hey|hi|morning|evening|welcome)\b/],
    ['bye', /\b(bye|goodnight|later|see you|take care)\b/],
  ];
  return groups.find(([label, regex]) => labels.includes(label) && regex.test(input))?.[0] || 'random';
}

function pick(mood = 'random', random = Math.random) {
  const entries = list();
  if (!entries.length) return null;
  const normalized = normalizeMood(mood);
  const matching = normalized === 'random' ? entries : entries.filter((entry) => entry.mood === normalized);
  const pool = matching.length ? matching : entries;
  const entry = pool[Math.floor(random() * pool.length)];
  try {
    return { entry, buffer: fs.readFileSync(path.join(ROOT, entry.file)) };
  } catch {
    return null;
  }
}

function shouldSend(chatId, incoming, reply, random = Math.random, now = Date.now()) {
  if (!isEnabled(chatId) || !list().length) return false;
  const explicit = /\b(send|drop|give|show|use)\b.{0,18}\bsticker\b|\bsticker\b.{0,18}\b(please|pls|now)\b/i.test(String(incoming || ''));
  if (!explicit && now - (cooldowns.get(chatId) || 0) < 20 * 60 * 1000) return false;
  if (!explicit && random() >= 0.16) return false;
  cooldowns.set(chatId, now);
  return true;
}

module.exports = { add, list, remove, pick, detectMood, shouldSend, isEnabled, setEnabled, normalizeMood, ROOT, INDEX, ENABLED_KEY };
