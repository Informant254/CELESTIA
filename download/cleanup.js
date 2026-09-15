/**
 * download/cleanup.js — dedicated tmp dir + guaranteed cleanup (try/finally).
 */
const fs = require('fs');
const path = require('path');
const { tmpDir } = require('./engines');

function jobDir(prefix = 'job') {
  const dir = tmpDir();
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const p = path.join(dir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function wipeDir(dir) {
  try {
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.error('[DL] cleanup failed for', dir, e.message);
  }
}

// Remove stale job dirs older than maxAgeMs (called at startup + opportunistically).
function sweepStale(maxAgeMs = 30 * 60 * 1000) {
  try {
    const dir = tmpDir();
    const now = Date.now();
    for (const entry of fs.readdirSync(dir)) {
      const p = path.join(dir, entry);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > maxAgeMs) wipeDir(p);
      } catch { /* ignore */ }
    }
  } catch { /* tmp may not exist yet */ }
}

function dirSizeBytes(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      try {
        total += entry.isDirectory() ? dirSizeBytes(p) : fs.statSync(p).size;
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return total;
}

module.exports = { jobDir, wipeDir, sweepStale, dirSizeBytes };
