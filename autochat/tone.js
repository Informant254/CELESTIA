/**
 * autochat/tone.js — per-person gender tone tags.
 * The owner tags a contact once (`.tone girl` / `.tone boy`); autochat then
 * uses the right energy for that person in DMs and in group threads.
 * Untagged people get the neutral default. Tasteful only — never explicit.
 */
const settingsStore = require('../utils/settingsStore');

const KEY = 'autochat_tone'; // { bareDigits: 'girl' | 'boy' }

function bare(value) {
  return String(value || '').replace(/\D/g, '');
}

function all() {
  const v = settingsStore.get(KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function get(digits) {
  const t = all()[bare(digits)];
  return t === 'girl' || t === 'boy' ? t : null;
}

function set(digits, tone) {
  const d = bare(digits);
  if (!/^\d{7,16}$/.test(d)) return false;
  const map = all();
  if (tone === 'girl' || tone === 'boy') map[d] = tone;
  else delete map[d];
  settingsStore.set(KEY, map);
  return true;
}

function list() {
  return Object.entries(all()).filter(([, t]) => t === 'girl' || t === 'boy');
}

// Resolve the tone for the person being answered: group threads carry the
// sender after '::', DMs use the inbox number. Falls back through every
// identity field like the flirt allowlist.
function resolve(msg, threadId, chatId) {
  const cands = [];
  if (threadId && String(threadId).includes('::')) cands.push(bare(String(threadId).split('::')[1]));
  cands.push(
    bare(msg?.key?.participantPn),
    bare(msg?.key?.participantAlt),
    bare(msg?.key?.participant),
    bare(msg?.key?.remoteJidAlt),
  );
  if (!String(chatId || '').endsWith('@g.us')) cands.push(bare(chatId));
  for (const c of cands) {
    const t = c && get(c);
    if (t) return t;
  }
  return null;
}

module.exports = { get, set, list, resolve, bare };
