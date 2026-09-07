const path = require('path');
const fs = require('fs');

// Persistent store for auto-unmute timers: { [groupJid]: unmuteAtMs }
const TIMERS_FILE = path.join(__dirname, '..', 'data', 'muteTimers.json');

function loadTimers() {
  try {
    if (fs.existsSync(TIMERS_FILE)) return JSON.parse(fs.readFileSync(TIMERS_FILE, 'utf8'));
  } catch { /* corrupt file -> start fresh */ }
  return {};
}

function saveTimers(t) {
  try { fs.writeFileSync(TIMERS_FILE, JSON.stringify(t, null, 2)); } catch { /* best effort */ }
}

const RUNNING = new Set(); // groupJids with an active in-memory timer this boot

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

function unmarshal(sock, jid) {
  // unmute now + clean up bookkeeping + announce
  const timers = loadTimers();
  delete timers[jid];
  saveTimers(timers);
  RUNNING.delete(jid);
  sock.groupSettingUpdate(jid, 'not_announcement')
    .then(() => sock.sendMessage(jid, { text: '⏰ *Mute expired* — group unmuted automatically. Welcome back.' }).catch(() => {}))
    .catch(() => { // couldn't unmute (lost admin, etc) - drop the timer so it doesn't loop forever
      sock.sendMessage(jid, { text: '⚠️ Timer ended but I could not unmute — am I still admin?' }).catch(() => {});
    });
}

function scheduleUnmute(sock, jid, ms) {
  const timers = loadTimers();
  timers[jid] = Date.now() + ms;
  saveTimers(timers);

  if (RUNNING.has(jid)) return; // a live timer already covers this group this boot
  RUNNING.add(jid);
  const fire = () => {
    const t = loadTimers();
    const at = t[jid];
    if (!at) { RUNNING.delete(jid); return; }
    const wait = at - Date.now();
    if (wait <= 0) { unmarshal(sock, jid); return; }
    setTimeout(fire, wait);
  };
  fire();
}

/** Called once at boot from index.js: resume any timers that survived a restart. */
function resumeAll(sock) {
  const timers = loadTimers();
  const now = Date.now();
  let due = 0;
  for (const jid of Object.keys(timers)) {
    const at = timers[jid];
    if (!at || at <= now) { due++; continue; } // fires immediately below
    scheduleUnmute(sock, jid, at - now);
  }
  // expired while offline -> unmute right away
  if (due) {
    const stale = Object.keys(timers).filter(jid => !timers[jid] || timers[jid] <= now);
    for (const jid of stale) unmarshal(sock, jid);
  }
  const active = Object.keys(loadTimers()).length;
  return active;
}

module.exports = { parseDuration, formatDuration, scheduleUnmute, resumeAll };
