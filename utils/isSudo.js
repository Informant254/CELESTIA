const fs = require('fs');
const path = require('path');
const { isOwner } = require('./isOwner');

const sudoPath = path.join(__dirname, '../config/sudoList.json');
const DB_KEY = 'sudo_list';

// The JSON file is a fast local cache; Postgres (via settingsStore) is the
// durable home — Heroku dyno disks are wiped on every restart.
function persistedList() {
  try {
    const { get } = require('./settingsStore');
    const list = get(DB_KEY, null);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// mtime-guarded cache: isSudo runs on every suspicious message, and hitting
// disk + JSON.parse each time is pure waste. Last-good list survives a
// corrupt file instead of throwing into message dispatch.
let cache = { mtime: 0, list: [] };
function load() {
  try {
    const st = fs.statSync(sudoPath);
    if (st.mtimeMs === cache.mtime) return cache.list;
    const parsed = JSON.parse(fs.readFileSync(sudoPath, 'utf8'));
    cache = { mtime: st.mtimeMs, list: Array.isArray(parsed) ? parsed : [] };
    return cache.list;
  } catch {
    const persisted = persistedList();
    if (persisted.length) {
      cache = { mtime: cache.mtime, list: persisted };
      return cache.list;
    }
    return cache.list;
  }
}
function save(list) {
  try {
    fs.writeFileSync(sudoPath, JSON.stringify(list, null, 2));
    cache = { mtime: fs.statSync(sudoPath).mtimeMs, list };
  } catch {
    cache = { mtime: 0, list };
  }
  try {
    const { set } = require('./settingsStore');
    set(DB_KEY, list);
  } catch { /* in-memory list still applies this session */ }
}

function isSudo(msg) {
  if (isOwner(msg)) return true;
  const allowed = new Set(load().map(normalizeNumber).filter(Boolean));
  const candidates = [
    msg?.participant,
    msg?.key?.participantPn,
    msg?.key?.participantAlt,
    msg?.key?.participant,
    msg?.key?.remoteJidAlt,
    msg?.key?.remoteJid,
  ].map(normalizeNumber).filter(Boolean);
  return candidates.some((number) => allowed.has(number));
}

function normalizeNumber(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function addSudo(number) {
  number = normalizeNumber(number);
  if (!number) return false;
  const list = load();
  if (!list.includes(number)) list.push(number);
  save(list);
  return true;
}
function removeSudo(number) {
  save(load().filter(n => n !== number));
}
function listSudo() {
  return load();
}
function clearSudo() {
  save([]);
}

module.exports = { isSudo, addSudo, removeSudo, listSudo, clearSudo };
