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

// Harvest one outgoing owner message. Silent, cheap, capped, saved at once
// (owner message volume is human-scale; no throttle needed).
function collect(text) {
  const t = String(text || '').trim();
  if (!t || t.length < 2 || t.length > 280) return false;
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
  const t = String(line || '').trim().slice(0, 280);
  if (!t) return false;
  const v = all();
  v.push(t);
  save(v);
  return true;
}

function forget() {
  try {
    settingsStore.set(KEY, []);
  } catch { /* ignore */ }
}

function count() {
  return all().length;
}

// Style block for the prompt: stats + freshest examples (most representative).
function styleBlock() {
  const v = all();
  if (!v.length) return 'No voice samples yet — write naturally and I will pick up the style.';
  const sample = v.slice(-8);
  const avgLen = Math.round(v.reduce((a, l) => a + l.length, 0) / v.length);
  const emojiLines = v.filter((l) => /\p{Emoji}/u.test(l)).length;
  return [
    `Message length habit: ~${avgLen} chars. Emoji habit: ${emojiLines}/${v.length} messages carry emoji.`,
    'Real examples of how YOU text (match this energy, cadence, slang exactly):',
    ...sample.map((l) => `- "${l}"`),
  ].join('\n');
}

module.exports = { collect, learn, forget, count, styleBlock };
