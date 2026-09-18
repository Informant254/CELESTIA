const path = require('path');
const fs = require('fs');

// Persistent store for auto-unmute timers: { [groupJid]: unmuteAtMs }
const TIMERS_FILE = path.join(__dirname, '..', 'data', 'muteTimers.json');
const MAX_DELAY = 2 ** 31 - 1;

try { fs.mkdirSync(path.dirname(TIMERS_FILE), { recursive: true }); } catch { /* handled by saveTimers */ }

function loadTimers() {
  try {
    if (fs.existsSync(TIMERS_FILE)) return JSON.parse(fs.readFileSync(TIMERS_FILE, 'utf8'));
  } catch { /* corrupt file -> start fresh */ }
  return {};
}

function saveTimers(t) {
  try {
    fs.mkdirSync(path.dirname(TIMERS_FILE), { recursive: true });
    fs.writeFileSync(TIMERS_FILE, JSON.stringify(t, null, 2));
  } catch { /* best effort */ }
}

const RUNNING = new Map(); // groupJid -> active timeout handle

/**
 * Parses "90", "90s", "5m", "2h", "1d", "1h30m", "2d 12h" into milliseconds.
 * Returns null when nothing parses.
 */
function parseDuration(str) {
  const input = String(str || '').toLowerCase().trim();
  if (!input) return null;

  // plain number = minutes (".mute 90" -> 90 minutes)
  if (/^\d+$/.test(input)) {
    const mins = parseInt(input, 10);
    return mins > 0 ? mins * 60_000 : null;
  }

  const re = /(\d+)\s*(d|h|m|s)/g;
  let ms = 0;
  let match;
  let matched = false;
  while ((match = re.exec(input)) !== null) {
    matched = true;
    const val = parseInt(match[1], 10);
    if (val <= 0) return null;
    if (match[2] === 'd') ms += val * 86_400_000;
    else if (match[2] === 'h') ms += val * 3_600_000;
    else if (match[2] === 'm') ms += val * 60_000;
    else ms += val * 1_000;
  }
  return matched && ms > 0 ? ms : null;
}

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

async function unmarshal(sock, jid, expectedAt) {
  RUNNING.delete(jid);
  try {
    await sock.groupSettingUpdate(jid, 'not_announcement');
    const timers = loadTimers();
    if (timers[jid] === expectedAt) {
      delete timers[jid];
      saveTimers(timers);
    }
    await sock.sendMessage(jid, { text: '⏰ *Mute expired* — group unmuted automatically. Welcome back.' }).catch(() => {});
  } catch {
    // Keep the persisted record so a reconnect/restart can retry with a fresh socket.
    await sock.sendMessage(jid, { text: '⚠️ Timer ended but I could not unmute — am I still admin?' }).catch(() => {});
  }
}

function armTimer(sock, jid, at) {
  const previous = RUNNING.get(jid);
  if (previous) clearTimeout(previous);

  const remaining = at - Date.now();
  const delay = Math.max(0, Math.min(remaining, MAX_DELAY));
  const handle = setTimeout(() => {
    if (at - Date.now() > 0) armTimer(sock, jid, at);
    else void unmarshal(sock, jid, at);
  }, delay);
  RUNNING.set(jid, handle);
}

function scheduleUnmute(sock, jid, ms) {
  const timers = loadTimers();
  const at = Date.now() + ms;
  timers[jid] = at;
  saveTimers(timers);
  armTimer(sock, jid, at);
}

function cancelUnmute(jid) {
  const handle = RUNNING.get(jid);
  if (handle) clearTimeout(handle);
  RUNNING.delete(jid);

  const timers = loadTimers();
  if (jid in timers) {
    delete timers[jid];
    saveTimers(timers);
  }
}

/** Called once at boot from index.js: resume any timers that survived a restart. */
function resumeAll(sock) {
  for (const handle of RUNNING.values()) clearTimeout(handle);
  RUNNING.clear();

  const timers = loadTimers();
  for (const [jid, at] of Object.entries(timers)) {
    if (Number.isFinite(at) && at > 0) armTimer(sock, jid, at);
  }
  return RUNNING.size;
}

module.exports = { parseDuration, formatDuration, scheduleUnmute, cancelUnmute, resumeAll };
