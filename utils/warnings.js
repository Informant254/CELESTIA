const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'warnings.json');

function ensureFileExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}), 'utf-8');
  }
}

// In-memory write-through cache: strikes must land instantly (a raid is
// dozens of messages per second), while disk writes are throttled so a
// flood can't turn every strike into a full file rewrite.
let cache = null;
let dirty = false;
let saveTimer = null;

function readAll() {
  if (cache) return cache;
  ensureFileExists();
  try {
    cache = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    if (!cache || typeof cache !== 'object') cache = {};
  } catch {
    cache = {};
  }
  return cache;
}

function writeAll(data) {
  cache = data && typeof data === 'object' ? data : {};
  scheduleSave();
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    try {
      ensureFileExists();
      fs.writeFileSync(FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('[warnings] Failed to persist:', err.message);
    }
  }, 2000);
  if (saveTimer.unref) saveTimer.unref();
}

// Synchronous flush for clean shutdown paths and tests.
function flush() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!dirty && cache) return;
  dirty = false;
  try {
    ensureFileExists();
    fs.writeFileSync(FILE_PATH, JSON.stringify(cache || {}, null, 2), 'utf-8');
  } catch (err) {
    console.error('[warnings] Failed to persist:', err.message);
  }
}

function key(groupJid, userJid) {
  return `${groupJid}::${userJid}`;
}

function addWarning(groupJid, userJid) {
  const data = readAll();
  const k = key(groupJid, userJid);
  data[k] = (data[k] || 0) + 1;
  scheduleSave();
  return data[k];
}

function getWarnings(groupJid, userJid) {
  return readAll()[key(groupJid, userJid)] || 0;
}

function resetWarnings(groupJid, userJid) {
  const data = readAll();
  delete data[key(groupJid, userJid)];
  scheduleSave();
}

module.exports = { addWarning, getWarnings, resetWarnings, flush };
