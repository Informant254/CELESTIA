/**
 * 🛡️ CELESTIA Settings Guardian — survive panel restarts & wipes.
 *
 * Panels (Pterodactyl, Railway, Render, Fly) kill processes without
 * warning (SIGTERM, OOM, redeploys) and some wipe the filesystem.
 * The guardian keeps a rolling backup of everything she needs to
 * wake up intact, and restores whatever is missing on boot:
 *
 *   backed up : auth_info_baileys/ (session), data/ (settings DB),
 *               config/botSettings.json (runtime settings), vault/ (media)
 *   skipped   : node_modules, .git, logs, pairing_sessions, .bkp itself
 *   cadence   : every 10s (unref'd — never holds the process open)
 *               + on SIGTERM (clean shutdown)
 *               + restoreMissing() on boot (fills gaps only, never clobbers)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, '.bkp');
const MAX_FILE = 8 * 1024 * 1024; // skip single files bigger than 8MB

const BACKUP_TARGETS = ['auth_info_baileys', 'data', 'config/botSettings.json', 'vault'];

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.bkp', 'logs', 'pairing_sessions',
]);

function copyFile(src, dst) {
  try {
    const size = fs.statSync(src).size;
    if (size > MAX_FILE) return;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  } catch (_) { /* best effort — never crash the bot over a backup */ }
}

function copyDir(src, dst) {
  let entries;
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (entry.name.endsWith('-shm') || entry.name.endsWith('-wal')) continue;
    if (entry.name.startsWith('.') && entry.name !== '.bkp') {
      // keep lock/hidden files out, except nothing we need lives there
      continue;
    }
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      copyDir(srcPath, dstPath);
    } else {
      copyFile(srcPath, dstPath);
    }
  }
}

function backupNow() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    for (const target of BACKUP_TARGETS) {
      const src = path.join(ROOT, target);
      if (!fs.existsSync(src)) continue;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) copyDir(src, path.join(BACKUP_DIR, target));
      else copyFile(src, path.join(BACKUP_DIR, target));
    }
  } catch (_) { /* best effort */ }
}

function restoreMissing() {
  if (!fs.existsSync(BACKUP_DIR)) return 0;
  let restored = 0;
  const walk = (backupBase, liveBase) => {
    let entries;
    try {
      entries = fs.readdirSync(backupBase, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const bPath = path.join(backupBase, entry.name);
      const lPath = path.join(liveBase, entry.name);
      if (entry.isDirectory()) {
        walk(bPath, lPath);
      } else if (!fs.existsSync(lPath)) {
        try {
          fs.mkdirSync(path.dirname(lPath), { recursive: true });
          fs.copyFileSync(bPath, lPath);
          restored++;
        } catch (_) { /* best effort */ }
      }
    }
  };
  walk(BACKUP_DIR, ROOT);
  if (restored > 0) {
    try { console.log(`[guardian] Restored ${restored} missing file(s) from backup.`); } catch (_) {}
  }
  return restored;
}

function startGuardian() {
  if (global.__guardianStarted) return;
  global.__guardianStarted = true;
  // Rolling backup every 10s — unref'd so it never holds the process open.
  // Catches setting changes even when the panel kills us without SIGTERM.
  setInterval(() => backupNow(), 10_000).unref();
  // Clean-shutdown backup.
  process.on('SIGTERM', () => {
    try { backupNow(); } catch (_) {}
  });
}

module.exports = { backupNow, restoreMissing, startGuardian, BACKUP_DIR };
