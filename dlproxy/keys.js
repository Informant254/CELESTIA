/**
 * dlproxy/keys.js — client key store + per-key quotas.
 *
 * Keys live in dlproxy/keys.json (gitignored, never committed). Each key:
 *   { label, rpm, rpd, usedDay, usedDayAt, usedMin, usedMinAt }
 * Quotas reset on a rolling minute / calendar day. Persisted so restarts
 * don't wipe accounting.
 */
const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, 'keys.json');

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (raw && typeof raw === 'object') return raw;
  } catch { /* start empty */ }
  return {};
}

function save(keys) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function dayStamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function minStamp(d = new Date()) {
  return `${dayStamp(d)}T${d.getHours()}:${d.getMinutes()}`;
}

// Returns { ok } or { ok:false, reason } — and records the hit on success.
function checkAndHit(keys, key) {
  const entry = keys[key];
  if (!entry) return { ok: false, reason: 'Invalid API key.' };
  const day = dayStamp();
  const min = minStamp();
  if (entry.usedDayAt !== day) { entry.usedDayAt = day; entry.usedDay = 0; }
  if (entry.usedMinAt !== min) { entry.usedMinAt = min; entry.usedMin = 0; }
  if (entry.usedMin >= (entry.rpm || 20)) return { ok: false, reason: 'Rate limited (per-minute quota).' };
  if (entry.usedDay >= (entry.rpd || 500)) return { ok: false, reason: 'Daily quota exhausted.' };
  entry.usedMin += 1;
  entry.usedDay += 1;
  return { ok: true, label: entry.label || '' };
}

function issue(keys, key, label, rpm, rpd) {
  keys[key] = {
    label: label || 'client',
    rpm: rpm || 20,
    rpd: rpd || 500,
    usedDay: 0, usedDayAt: dayStamp(), usedMin: 0, usedMinAt: minStamp(),
  };
  return keys[key];
}

function revoke(keys, key) {
  if (keys[key]) { delete keys[key]; return true; }
  return false;
}

module.exports = { load, save, checkAndHit, issue, revoke, KEYS_FILE };
