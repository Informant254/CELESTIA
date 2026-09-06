const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const lockFile = path.join(__dirname, '../auth_info_baileys/.instance.lock');
const IS_WINDOWS = process.platform === 'win32';

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0); // throws if dead
    return true;
  } catch (e) {
    // On Windows, process.kill(0) can fail with EPERM for processes owned by
    // others — that means it IS alive, we just can't signal it.
    return e.code === 'EPERM';
  }
}

// Returns the command line of a PID, or null if unreadable.
// Cross-platform: /proc/<pid>/cmdline on Linux, WMIC/tasklist on Windows.
function getCmdline(pid) {
  if (IS_WINDOWS) {
    try {
      // PowerShell gets full command line reliably on Win10/11.
      const out = execSync(
        `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,
        { timeout: 5000, encoding: 'utf8', windowsHide: true }
      );
      return (out || '').trim();
    } catch {
      return null;
    }
  }
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
  } catch {
    return null;
  }
}

function isOurProcess(pid) {
  if (!isProcessAlive(pid)) return false; // dead process — stale lock
  const cmdline = getCmdline(pid);
  if (!cmdline) {
    // Alive but cmdline unreadable — safest to assume it's a real instance
    // (the "can't verify" case). Better one false exit than two live bots.
    return true;
  }
  // Must be node AND running index.js — rules out Pterodactyl daemon (PID 27)
  return /\bnode(\.exe)?\b/i.test(cmdline) && /index\.js/.test(cmdline);
}
function acquireLock() {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  if (fs.existsSync(lockFile)) {
    const oldPid = Number(fs.readFileSync(lockFile, 'utf8').trim());
    if (oldPid === process.pid) {
      // Container/host assigned us the SAME PID as the lock file from a
      // previous boot (common on Pterodactyl/Docker — PID assignment is
      // deterministic per container start). This can't be "another"
      // instance since it's literally us — the lock is stale, not real.
      console.warn(`[instanceLock] ⚠️ Lock PID (${oldPid}) matches our own PID — stale lock from a previous boot. Replacing.`);
      fs.unlinkSync(lockFile);
    } else if (isOurProcess(oldPid)) {
      console.error(`[instanceLock] ❌ Another CELESTIA instance is running (PID ${oldPid}). Exiting.`);
      process.exit(1);
    } else {
      // Stale or foreign PID — clean it up
      console.warn(`[instanceLock] ⚠️ Stale lock (PID ${oldPid}). Replacing.`);
      fs.unlinkSync(lockFile);
    }
  }
  fs.writeFileSync(lockFile, process.pid.toString());
  console.log(`[instanceLock] ✅ Lock acquired (PID ${process.pid})`);
}
function releaseLock() {
  try {
    if (
      fs.existsSync(lockFile) &&
      fs.readFileSync(lockFile, 'utf8').trim() === String(process.pid)
    ) {
      fs.unlinkSync(lockFile);
      console.log('[instanceLock] 🔓 Lock released.');
    }
  } catch {}
}
module.exports = { acquireLock, releaseLock };
