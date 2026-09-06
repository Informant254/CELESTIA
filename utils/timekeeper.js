/**
 * ⏰ TIMEKEEPER — CELESTIA's memory of moments yet to come ⏰
 *
 * Three powers, one engine:
 *   - Reminders: "she remembers so you don't have to" — DMs you at the moment
 *   - Time capsules: messages to the future — to yourself OR anyone
 *   - Habit streaks: daily check-ins, she counts your fire
 *
 * All persisted in settingsStore. The delivery loop lives in index.js
 * (checkDeliveries, every 20s — minute-precision, no misses).
 */

const settingsStore = require('./settingsStore');

const KEYS = {
  reminders: 'tk_reminders',  // [{id, ownerJid, targetJid, text, dueTs, delivered, kind, meta}]
  habits: 'tk_habits',        // {habitKey: {name, streak, best, lastCheck, history: [dateStr]}}
  counter: 'tk_counter',
};

function uid(prefix) {
  const n = settingsStore.get(KEYS.counter, 0) + 1;
  settingsStore.set(KEYS.counter, n);
  return `${prefix}-${n}`;
}

// ─────────────────────────────────────────
// TIME PARSING — "45m", "2h", "3d", "9pm", "21:30", "tomorrow 8am", "1 jan 2027"
// ─────────────────────────────────────────

function parseWhen(whenStr, base = new Date()) {
  if (!whenStr) return null;
  const s = String(whenStr).toLowerCase().trim();
  const now = base;

  // relative: 45m / 2h / 3d / 1w (also 45min, 2hrs, etc.)
  const rel = s.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)\b/);
  if (rel) {
    const n = parseFloat(rel[1]);
    const unit = rel[2][0]; // m | h | d | w
    const mult = { m: 60000, h: 3600000, d: 86400000, w: 7 * 86400000 }[unit];
    return { ts: Date.now() + n * mult, label: `in ${rel[1]}${unit}` };
  }

  // today/tomorrow + optional time
  const dayMatch = s.match(/^(today|tomorrow|tmr)\s*(.*)/);
  if (dayMatch) {
    const d = new Date(now);
    if (dayMatch[1] !== 'today') d.setDate(d.getDate() + 1);
    const t = parseClock(dayMatch[2], d);
    if (t) return t;
    // bare "tomorrow" → default 9am
    d.setHours(9, 0, 0, 0);
    return { ts: d.getTime(), label: `tomorrow 09:00` };
  }

  // bare clock: 9pm, 21:30, 9:15am (today; if passed, tomorrow)
  const clock = parseClock(s, now);
  if (clock) {
    if (clock.ts <= Date.now() + 60000) {
      // already passed today → tomorrow same time
      return { ts: clock.ts + 86400000, label: `tomorrow ${clock.label}` };
    }
    return clock;
  }

  // absolute date: 1jan2027, 25 dec, 2027-01-01, 25/12
  const dateAbs = s.match(/^(\d{1,2})[\s\-\/]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})?(?:[\s\-\/](\d{4}))?(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/);
  if (dateAbs) {
    const d = new Date(now.getFullYear(), 0, 1);
    d.setMonth(parseInt(dateAbs[2], 10) > 12 || /[a-z]/.test(dateAbs[2])
      ? ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(String(dateAbs[2]).slice(0,3))
      : parseInt(dateAbs[2], 10) - 1);
    d.setDate(parseInt(dateAbs[1], 10));
    if (dateAbs[3]) d.setFullYear(parseInt(dateAbs[3], 10));
    d.setHours(dateAbs[4] ? parseInt(dateAbs[4], 10) + (/pm/.test(dateAbs[6] || '') && parseInt(dateAbs[4], 10) < 12 ? 12 : 0) : 9, dateAbs[5] ? parseInt(dateAbs[5], 10) : 0, 0, 0);
    if (isNaN(d.getTime()) || d.getTime() <= Date.now()) return null;
    return { ts: d.getTime(), label: d.toLocaleDateString() };
  }

  return null;
}

function parseClock(str, day) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  const d = new Date(day);
  d.setHours(h, min, 0, 0);
  const label = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return { ts: d.getTime(), label };
}

function fmtWhen(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return sameDay ? `today ${time}` : `${date} ${time}`;
}

// ─────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────

function addReminder({ ownerJid, targetJid, text, dueTs, kind = 'reminder', meta = null }) {
  const list = settingsStore.get(KEYS.reminders, []);
  const id = uid('r');
  const entry = { id, ownerJid, targetJid, text, dueTs, delivered: false, kind, meta, createdTs: Date.now() };
  list.push(entry);
  settingsStore.set(KEYS.reminders, list);
  return entry;
}

function getPending(now = Date.now()) {
  const list = settingsStore.get(KEYS.reminders, []);
  return list.filter(r => !r.delivered && r.dueTs <= now);
}

function markDelivered(ids) {
  const list = settingsStore.get(KEYS.reminders, []);
  for (const r of list) {
    if (ids.includes(r.id)) r.delivered = true;
  }
  settingsStore.set(KEYS.reminders, list);
}

function listReminders(ownerJid) {
  const list = settingsStore.get(KEYS.reminders, []);
  return list
    .filter(r => !r.delivered && r.ownerJid === ownerJid && r.kind === 'reminder')
    .sort((a, b) => a.dueTs - b.dueTs);
}

function cancelReminder(ownerJid, idOrIndex) {
  const list = settingsStore.get(KEYS.reminders, []);
  const mine = list.filter(r => !r.delivered && r.ownerJid === ownerJid && r.kind === 'reminder');
  let target = null;
  // by index
  const idx = parseInt(idOrIndex, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= mine.length) target = mine[idx - 1];
  // by id
  if (!target) target = mine.find(r => r.id === idOrIndex);
  if (!target) return null;
  target.delivered = true;
  target.cancelled = true;
  settingsStore.set(KEYS.reminders, list);
  return target;
}

// ─────────────────────────────────────────
// TIME CAPSULES (kind === 'capsule')
// ─────────────────────────────────────────

function listCapsules(ownerJid) {
  const list = settingsStore.get(KEYS.reminders, []);
  return list
    .filter(r => !r.delivered && r.ownerJid === ownerJid && r.kind === 'capsule')
    .sort((a, b) => a.dueTs - b.dueTs);
}

// ─────────────────────────────────────────
// HABITS
// ─────────────────────────────────────────

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getHabits(ownerJid) {
  const all = settingsStore.get(KEYS.habits, {});
  return all[ownerJid] || {};
}

function saveHabits(ownerJid, habits) {
  const all = settingsStore.get(KEYS.habits, {});
  all[ownerJid] = habits;
  settingsStore.set(KEYS.habits, all);
}

function addHabit(ownerJid, name) {
  const habits = getHabits(ownerJid);
  const key = name.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
  if (habits[key]) return { error: 'already exists' };
  habits[key] = { name, streak: 0, best: 0, lastCheck: null, history: [] };
  saveHabits(ownerJid, habits);
  return { key, habit: habits[key] };
}

function checkHabit(ownerJid, key) {
  const habits = getHabits(ownerJid);
  const h = habits[key];
  if (!h) return { error: 'not found' };

  const today = todayKey();
  if (h.lastCheck === today) return { error: 'already today', habit: h };

  const yesterday = new Date(Date.now() - 86400000);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  h.streak = h.lastCheck === yKey ? h.streak + 1 : 1;
  h.best = Math.max(h.best, h.streak);
  h.lastCheck = today;
  if (h.history.length > 90) h.history = h.history.slice(-90);
  h.history.push(today);
  saveHabits(ownerJid, habits);
  return { habit: h, milestone: [3, 7, 14, 30, 50, 100, 365].includes(h.streak) ? h.streak : null };
}

function removeHabit(ownerJid, key) {
  const habits = getHabits(ownerJid);
  if (!habits[key]) return null;
  const gone = habits[key];
  delete habits[key];
  saveHabits(ownerJid, habits);
  return gone;
}

module.exports = {
  parseWhen, fmtWhen, todayKey,
  addReminder, getPending, markDelivered, listReminders, cancelReminder,
  listCapsules,
  addHabit, checkHabit, removeHabit, getHabits,
};
