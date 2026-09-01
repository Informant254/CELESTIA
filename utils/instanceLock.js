const fs = require('fs');
const path = require('path');
const lockFile = path.join(__dirname, '../auth_info_baileys/.instance.lock');
function isOurProcess(pid) {
  try {
    process.kill(pid, 0); // throws if dead
  } catch {
    return false; // dead process — stale lock
  }
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      .replace(/\0/g, ' ')
      .trim();
    // Must be node AND running index.js — rules out Pterodactyl daemon (PID 27)
    return /\bnode\b/i.test(cmdline) && cmdline.includes('index.js');
  } catch {
    return false; // /proc unreadable — treat as not ours
  }
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
