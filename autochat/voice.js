/**
 * autochat/voice.js — learns how the owner texts.
 * Auto-collects the owner's outgoing messages (capped, persisted throttled)
 * plus manual `.autochat learn <line>` examples. Builds the style block.
 */
const settingsStore = require('../utils/settingsStore');

const KEY = 'autochat_voice'; // array of short example lines
const CAP = 200;

function all() {
  const v = settingsStore.get(KEY, []);
  return Array.isArray(v) ? v : [];
}

function save(v) {
  try {
    settingsStore.set(KEY, v.slice(-CAP));
  } catch { /* never break chat */ }
}

// Never learn secrets: API keys pasted in chat must not enter the voice bank.
const SECRET_RE = /\b(sk-or-v1-[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{20,}|xox[bpras]-[A-Za-z0-9-]+|ghp_[A-Za-z0-9]+|gsk_[A-Za-z0-9]+|Bearer\s+[A-Za-z0-9._~-]{20,})\b/;

// Harvest one outgoing owner message. Silent, cheap, capped, saved at once
// (owner message volume is human-scale; no throttle needed).
function collect(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 2 || t.length > 280) return false;
  if (SECRET_RE.test(t)) return false; // keys stay out of her vocabulary
  if (/^[./!#]/.test(t)) return false; // skip bot commands
  if (/^https?:\/\//.test(t)) return false; // skip bare links
  const v = all();
  if (v.includes(t)) return false;
  v.push(t);
  if (v.length > CAP) v.splice(0, v.length - CAP);
  save(v);
  return true;
}

function learn(line) {
  // Bulk-friendly: paste many lines at once, each becomes a sample.
  const lines = String(line || '').split('\n').map((l) => l.trim().slice(0, 280)).filter(Boolean);
  if (!lines.length) return 0;
  const v = all();
  let added = 0;
  for (const t of lines) {
    if (v.includes(t)) continue;
    v.push(t);
    added += 1;
  }
  while (v.length > CAP) v.splice(0, v.length - CAP);
  save(v);
  return added;
}

function forget() {
  try {
    settingsStore.set(KEY, []);
  } catch { /* ignore */ }
}

function count() {
  return all().length;
}

// Representative sampling: spread evenly across the whole bank so old
// taught lines survive alongside recent auto-collected ones (newest-only
// windows forget bulk lessons the moment fresh chats arrive).
function pickSamples(v, n = 12) {
  const list = Array.isArray(v) ? v.filter(Boolean) : [];
  if (list.length <= n) return list.slice();
  const picked = [];
  const step = list.length / n;
  for (let i = 0; i < n; i++) picked.push(list[Math.floor(i * step)]);
  return [...new Set(picked)];
}

// Style block for the prompt: stats + representative examples.
function styleBlock() {
  const v = all();
  if (!v.length) return 'No voice samples yet — write naturally and I will pick up the style.';
  const sample = pickSamples(v);
  const avgLen = Math.round(v.reduce((a, l) => a + l.length, 0) / v.length);
  const emojiLines = v.filter((l) => /\p{Emoji}/u.test(l)).length;
  return [
    `Message length habit: ~${avgLen} chars. Emoji habit: ${emojiLines}/${v.length} messages carry emoji.`,
    'Real examples of how YOU text (match this energy, cadence, slang exactly):',
    ...sample.map((l) => `- "${l}"`),
  ].join('\n');
}

module.exports = { collect, learn, forget, count, styleBlock, pickSamples };
