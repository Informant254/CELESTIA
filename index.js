const nodeCrypto = require('node:crypto');
globalThis.crypto = nodeCrypto.webcrypto;
require('dotenv').config();

let guardian = null;
let currentSocket = null;
let healthServer = null;
let releaseInstanceLock = () => {};
let lockAcquired = false;
let shuttingDown = false;
let reconnectTimer = null;
let appLogger = console;
const runtimeState = {
  settingsReady: process.env.PAIR_MODE === 'true',
  connection: 'starting',
};

function authorizeQr(req, res) {
  const configured = process.env.QR_ACCESS_TOKEN || '';
  if (!configured) {
    res.sendStatus(404);
    return false;
  }

  const match = String(req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1] || (typeof req.query?.token === 'string' ? req.query.token : '');
  const expectedHash = nodeCrypto.createHash('sha256').update(configured).digest();
  const suppliedHash = nodeCrypto.createHash('sha256').update(supplied).digest();
  if (!nodeCrypto.timingSafeEqual(expectedHash, suppliedHash)) {
    res.status(401).json({ ok: false });
    return false;
  }

  res.set('Cache-Control', 'no-store');
  return true;
}

function disposeSocket(socket, reason = 'socket replaced') {
  if (!socket) return;
  try { socket.ev?.removeAllListeners?.(); } catch {}
  try { socket.end?.(new Error(reason)); } catch {}
}

function replaceCurrentSocket(socket) {
  if (currentSocket && currentSocket !== socket) disposeSocket(currentSocket);
  currentSocket = socket;
}

async function shutdown(exitCode = 0, reason = 'shutdown') {
  if (shuttingDown) return;
  shuttingDown = true;
  runtimeState.connection = 'shutting_down';
  const fallback = setTimeout(() => process.exit(exitCode), 5_000);

  try { appLogger.info?.(`[shutdown] ${reason}`); } catch {}
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try { guardian?.backupNow(); } catch {}

  const socket = currentSocket;
  currentSocket = null;
  disposeSocket(socket, reason);

  if (lockAcquired) {
    try { releaseInstanceLock(); } catch {}
    lockAcquired = false;
  }
  if (healthServer) {
    const server = healthServer;
    healthServer = null;
    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
        server.closeAllConnections?.();
      } catch { resolve(); }
    });
  }

  clearTimeout(fallback);
  process.exit(exitCode);
}

process.once('SIGTERM', () => { void shutdown(0, 'SIGTERM'); });
process.once('SIGINT', () => { void shutdown(0, 'SIGINT'); });
process.on('uncaughtException', (error) => {
  try { appLogger.error?.(`[uncaughtException] ${error.stack || error.message}`); } catch {}
  void shutdown(1, 'uncaught exception');
});
process.on('unhandledRejection', (reason) => {
  try { appLogger.error?.(`[unhandledRejection] ${reason?.stack || reason}`); } catch {}
});

// 🛡️ Settings guardian FIRST — restore anything a panel restart wiped,
// then keep rolling backups so the next kill loses nothing.
// (utils/settingsGuardian.js — restore fills gaps only, never clobbers.)
try {
  guardian = require('./utils/settingsGuardian');
  guardian.restoreMissing();
  guardian.startGuardian();
} catch {}

const path = require('path');
const { groupCache } = require('./utils/groupCache');
const figlet = require('figlet');
const chalk = require('chalk');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  proto,
} = require('@whiskeysockets/baileys');

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸš‚ PAIR_MODE â€” cloud pairing (Railway/Render/Koyep)
// When PAIR_MODE=true, this process becomes a pairing loop:
//   - requests a fresh code for OWNER_NUMBER every ~60s
//   - prints it BIG to the deploy Logs tab
//   - when the code is entered, session saves and this
//     process pairs + prints LINKED. Flip PAIR_MODE off,
//     redeploy, and she boots fully with the session.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
if (process.env.PAIR_MODE === 'true') {
  const PAIR_PHONE = String(process.env.OWNER_NUMBER || '').replace(/\D/g, '');
  const fsPair = require('fs');
  const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

  const pairLog = (...a) => console.log('[PAIR]', ...a);

  // ── QR fallback: typed codes expire fast + get rate-limited.
  // QR scan uses a separate flow and almost always works.
  // Latest QR is kept in memory and served at /qr.png + /qr (auto-refresh page).
  let lastQR = null;
  let lastQRAt = 0;
  let QRCode = null;
  try { QRCode = require('qrcode'); } catch { QRCode = null; }

  async function pairLoop() {
    if (!PAIR_PHONE) throw new Error('OWNER_NUMBER is required when PAIR_MODE=true.');
    runtimeState.connection = 'pairing';
    pairLog('=== CELESTIA CLOUD PAIRING ===');
    pairLog('Watching for a pairing code for:', PAIR_PHONE);
    pairLog('Enter each code in: WhatsApp > Linked Devices > Link a Device > Link with phone number instead');
    pairLog('Codes refresh automatically. This never exits.');
    pairLog('===============================');

    let linked = false;
    let attempts = 0;

    while (!linked && !shuttingDown) {
      let sock = null;
      try {
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();
        sock = makeWASocket({
          version,
          auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, child: () => ({ info(){}, warn(){}, error(){}, debug(){}, trace(){} }) }) },
          logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {}, child: () => ({ info(){}, warn(){}, error(){}, debug(){}, trace(){} }) },
          markOnlineOnConnect: false,
          browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
          syncFullHistory: false,
          // Initial sync bootstrap carries the LID identity mappings Baileys
          // needs for stable sessions. Allow the first chunk, then cut the flood.
          shouldSyncHistoryMessage: (() => { let budget = 200; return () => (budget-- > 0); })(),
        });
        replaceCurrentSocket(sock);

        linked = await new Promise((resolve) => {
          let settled = false;
          const done = (v) => { if (!settled) { settled = true; resolve(v); } };
          let codeAsked = false;

          sock.ev.on('creds.update', saveCreds);

          sock.ev.on('connection.update', async ({ connection, qr }) => {
            if (qr) {
              lastQR = qr;
              lastQRAt = Date.now();
            }
            if (connection === 'connecting' || connection === 'connected') runtimeState.connection = 'connecting';
            if (qr) runtimeState.connection = 'pairing';
            if ((connection === 'connecting' || connection === 'connected') && !codeAsked) {
              codeAsked = true;
              setTimeout(async () => {
                try {
                  attempts++;
                  const code = await sock.requestPairingCode(PAIR_PHONE);
                  console.log('');
                  console.log('â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ');
                  console.log(`  PAIRING CODE (attempt ${attempts}):`);
                  console.log('');
                  console.log(`       >>>   ${code}   <<<`);
                  console.log('');
                  console.log('  WhatsApp > Linked Devices > Link a Device');
                  console.log('  > "Link with phone number instead"');
                  console.log('  â–ˆâ–ˆâ–ˆâ–ˆ code valid ~2 min; fresh one every 90s â–ˆâ–ˆâ–ˆâ–ˆ');
                  console.log('â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆ');
                  console.log('');
                } catch (e) {
                  pairLog('code request failed:', (e?.message || '').slice(0, 80));
                }
              }, 5000);
            }

            if (connection === 'open') {
              runtimeState.connection = 'open';
              pairLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              pairLog('!!!  LINKED SUCCESSFULLY       !!!');
              pairLog('!!!  Session saved in container !!!');
              pairLog('!!!  Remove PAIR_MODE now       !!!');
              pairLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              done(true);
            }

            if (connection === 'close') {
              runtimeState.connection = 'closed';
              // calm: don't spam. resolve and let outer loop rest.
              setTimeout(() => done(false), 1000);
            }
          });

          // hard timeout per socket cycle: 90 seconds
          setTimeout(() => done(false), 90000);
        });
      } catch (e) {
        runtimeState.connection = 'error';
        pairLog('cycle error:', (e?.message || '').slice(0, 80));
      }

      if (!linked && !shuttingDown) {
        if (currentSocket === sock) currentSocket = null;
        disposeSocket(sock, 'pairing cycle ended');
        // clear partial state ONLY if un-registered; if creds show registered, keep them!
        try {
          const credsP = path.join(AUTH_DIR, 'creds.json');
          if (!fsPair.existsSync(credsP) || !JSON.parse(fsPair.readFileSync(credsP, 'utf8')).registered) {
            fsPair.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
        } catch {}
        pairLog('resting 30s before next code (gentle on WhatsApp)...');
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    // keep process alive after linking so creds flush & Railway doesn't restart mid-save
    pairLog('Pairing complete. Remove PAIR_MODE now and redeploy for full boot.');
    setInterval(() => {}, 60000);
  }

  // health server INSIDE pair mode: panels (Railway/nodeX/Pterodactyl)
  // probe /health — without this the deploy looks dead to them.
  const healthPair = require('express')();
  healthPair.get('/', (req, res) => res.json({ service: 'celestia-pairing-mode', ok: true }));
  healthPair.get('/health', (req, res) => {
    const ok = runtimeState.connection === 'open';
    res.json({ ok, state: runtimeState.connection, uptime: Math.floor(process.uptime()) });
  });
  healthPair.get('/ready', (req, res) => {
    const ok = runtimeState.connection === 'open';
    res.status(ok ? 200 : 503).json({ ok, state: runtimeState.connection, uptime: Math.floor(process.uptime()) });
  });
  // Live QR as PNG — open in a laptop browser, scan with the phone camera.
  // No typing, no 2-minute rush. Refreshes automatically with each new code.
  healthPair.get('/qr.png', async (req, res) => {
    if (!authorizeQr(req, res)) return;
    if (!lastQR || !QRCode) {
      return res.status(404).json({ ok: false, message: 'No QR yet — wait for the next cycle (~90s) and reload.' });
    }
    try {
      const png = await QRCode.toBuffer(lastQR, { width: 512, margin: 2 });
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      res.send(png);
    } catch (e) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });
  healthPair.get('/qr', async (req, res) => {
    if (!authorizeQr(req, res)) return;
    const age = lastQR ? Math.round((Date.now() - lastQRAt) / 1000) : -1;
    const dataUrl = lastQR && QRCode ? await QRCode.toDataURL(lastQR, { width: 512, margin: 2 }).catch(() => null) : null;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>CELESTIA — Scan to Pair</title></head><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#030510;color:#cfeaff;font-family:sans-serif;text-align:center;padding:24px;"><div style="font-size:40px;">🐺</div><h1 style="letter-spacing:8px;">CELESTIA</h1><p>WhatsApp → Linked Devices → Link a Device → scan:</p>${dataUrl ? `<img src="${dataUrl}" width="320" height="320" style="border-radius:16px;border:1px solid #00e5ff;">` : `<p>Waiting for QR… (first one lands ~90s after boot)</p>`}<p style="color:#8ea6c8;font-size:13px;">${age >= 0 ? `QR age: ${age}s — page auto-refreshes` : `codes still work too — check the deploy Logs tab`}</p></body></html>`);
  });
  healthServer = healthPair.listen(process.env.PORT || 3000, '0.0.0.0', () => pairLog('health server up on /health'));

  // never crash the deploy: catch everything, keep container alive
  pairLoop().catch((e) => {
    pairLog('fatal:', e.message, '— restarting loop in 60s');
    if (!shuttingDown) setTimeout(() => { if (!shuttingDown) pairLoop().catch(() => {}); }, 60000);
  });
} else {
// â•â•â•â•â•â•â•â•â•â•â• END PAIR_MODE â€” normal boot below â•â•â•â•â•â•â•â•â•â•â•

const config = require('./config/config');
const logger = require('./utils/logger');
appLogger = logger;
const { loadCommands } = require('./utils/commandLoader');
const { registerConnectionHandler } = require('./events/connection');
const { registerMessageHandler } = require('./events/messages');
const { fetchCore } = require('./utils/fetchCore');
const instanceLock = require('./utils/instanceLock');
const { acquireLock } = instanceLock;
releaseInstanceLock = instanceLock.releaseLock;
const fs = require('fs');
const express = require('express');

// Prevent two instances running at the same time â€” dual instances
// cause Bad MAC errors that corrupt the WhatsApp Signal session.
acquireLock();
lockAcquired = true;

// --- VPS Health Server (for Docker / UptimeRobot) ---
// ðŸº WolfTech tribute included in every heartbeat
const wolfTech = require('./utils/wolfTech');
const healthApp = express();
healthApp.get('/', (req, res) => res.json({ 
  status: 'CELESTIA âœ¨ The Most Beautiful Bot', 
  uptime: process.uptime(), 
  bot: config.botName, 
  features: ['celestia','heavenly','vps','beautiful'],
  lineage: wolfTech.tribute.fullTagline,
  inspiredBy: 'WolfTech ðŸº',
  dna: wolfTech.tribute.dna,
  tribute: wolfTech.getHealthTribute()
}));
healthApp.get('/health', (req, res) => {
  const ok = runtimeState.settingsReady && runtimeState.connection === 'open';
  const state = runtimeState.settingsReady ? runtimeState.connection : 'initializing';
  res.json({ ok, state, uptime: Math.floor(process.uptime()) });
});
healthApp.get('/ready', (req, res) => {
  const ok = runtimeState.settingsReady && runtimeState.connection === 'open';
  const state = runtimeState.settingsReady ? runtimeState.connection : 'initializing';
  res.status(ok ? 200 : 503).json({ ok, state, uptime: Math.floor(process.uptime()) });
});
healthApp.get('/qr', async (req, res) => {
  if (!authorizeQr(req, res)) return;
  const qr = globalThis.__lastQR;
  const age = qr ? Math.round((Date.now() - globalThis.__lastQRAt) / 1000) : -1;
  const fresh = qr && age <= 50;
  const dataUrl = fresh ? await require('qrcode').toDataURL(qr, { width: 512, margin: 2 }).catch(() => null) : null;
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>CELESTIA — Live QR</title></head><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#030510;color:#cfeaff;font-family:sans-serif;text-align:center;padding:24px;"><div style="font-size:40px;">🐺</div><h1 style="letter-spacing:8px;margin:8px 0;">CELESTIA</h1>${dataUrl ? `<p style="color:#00e5ff;">● LIVE QR — ${age}s old — scan now</p><img src="${dataUrl}" width="340" height="340" style="border-radius:16px;border:2px solid #00e5ff;">` : `<p style="color:#ffcf6b;">Waiting for a fresh QR… (auto-refreshes every 10s)</p>`}<p style="color:#8ea6c8;font-size:13px;">WhatsApp → Linked Devices → Link a Device → scan this screen with your phone</p></body></html>`);
});
healthApp.get('/qr.png', async (req, res) => {
  if (!authorizeQr(req, res)) return;
  const qr = globalThis.__lastQR;
  if (!qr) return res.status(404).json({ ok: false, message: 'No QR yet — reload in a few seconds.' });
  try {
    const png = await require('qrcode').toBuffer(qr, { width: 512, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});
healthApp.get('/wolftech', (req, res) => res.json({ tribute: wolfTech.tribute, lore: wolfTech.lore }));
// AI relay for friend deploys: GET /api/ai/:model?q=... with x-api-key: <their token>.
// Real Apix key never leaves this server (see utils/aiRelay.js).
healthApp.get('/api/ai/:model', (req, res) => require('./utils/aiRelay').handleRelay(req, res));
const HEALTH_PORT = config.dashboardPort;
healthServer = healthApp.listen(HEALTH_PORT, '0.0.0.0', () => logger.info(`ðŸŒ CELESTIA Health server on 0.0.0.0:${HEALTH_PORT} -> /health /qr /wolftech ðŸº`));

function restoreSettingsFromEnv() {
  const settingsPath = path.join(__dirname, 'config', 'botSettings.json');

  if (config.botSettingsData && !fs.existsSync(settingsPath)) {
    try {
      const raw = Buffer.from(config.botSettingsData, 'base64').toString('utf8');
      fs.writeFileSync(settingsPath, raw);
      logger.info('âœ… Restored bot settings from BOT_SETTINGS_DATA.');
    } catch (error) {
      logger.error(`[restoreSettingsFromEnv] Failed to restore settings: ${error.message}`);
    }
  }
}

function isValidCredsObject(parsed) {
  return !!parsed && typeof parsed === 'object' &&
    !!(parsed.noiseKey || parsed.signedIdentityKey) &&
    parsed.registrationId !== undefined;
}

function readCredsFile(credsPath) {
  try {
    if (!fs.existsSync(credsPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return isValidCredsObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isValidCredsFile(credsPath) {
  return !!readCredsFile(credsPath);
}

function sessionIdentity(creds) {
  if (!isValidCredsObject(creds)) return '';
  return nodeCrypto.createHash('sha256').update(JSON.stringify({
    registrationId: creds.registrationId,
    noiseKey: creds.noiseKey,
    signedIdentityKey: creds.signedIdentityKey,
    me: creds.me?.id || null,
  })).digest('hex');
}

function decodeSession(raw) {
  const cleaned = String(raw || '').trim().replace(/^[A-Za-z0-9_]+:~/, '');
  const buffer = Buffer.from(cleaned, 'base64');
  const creds = JSON.parse(buffer.toString('utf8'));
  if (!isValidCredsObject(creds)) throw new Error('missing identity keys');
  return { buffer, creds };
}

function restoreSessionFromEnv() {
  const authDir = path.join(__dirname, config.authFolder);
  const credsPath = path.join(authDir, 'creds.json');
  let raw = config.sessionId || process.env.SESSION_ID || process.env.WOLF_SESSION || '';

  // A corrupt creds.json from a bad SESSION_ID paste is worse than none:
  // quarantine it so we retry from env instead of looping on garbage.
  if (fs.existsSync(credsPath) && !isValidCredsFile(credsPath)) {
    try {
      const bad = credsPath + '.corrupt.' + Date.now();
      fs.renameSync(credsPath, bad);
      logger.error('[restoreSession] Existing creds.json is NOT valid Baileys credentials — quarantined to ' + bad + '. Will retry from SESSION_ID env.');
    } catch {}
  }

  if (fs.existsSync(credsPath)) {
    if (!raw) return;
    try {
      const current = readCredsFile(credsPath);
      const incoming = decodeSession(raw);
      if (current && sessionIdentity(current) === sessionIdentity(incoming.creds)) return;
      fs.rmSync(authDir, { recursive: true, force: true });
      logger.warn('[restoreSession] SESSION_ID belongs to a different pairing; replaced the complete Signal key store.');
    } catch (error) {
      logger.error(`[restoreSession] Refusing invalid SESSION_ID: ${error.message}`);
      return;
    }
  }

  // If last session was logged out, reject that exact credential until it is replaced.
  try {
    const settingsStore = require('./utils/settingsStore');
    if (settingsStore.get('_sessionLoggedOut', false)) {
      const revokedHash = settingsStore.get('_sessionRevokedHash', '');
      const currentHash = raw ? nodeCrypto.createHash('sha256').update(String(raw).trim()).digest('hex') : '';
      if (!raw || !revokedHash || currentHash === revokedHash) {
        logger.warn('[restoreSession] Refusing the logged-out session. Supply a fresh SESSION_ID or pair again.');
        return;
      }
      settingsStore.set('_sessionLoggedOut', false);
      settingsStore.set('_sessionRevokedHash', null);
    }
  } catch {}

  // Try SESSION_ID env var first (supports both CELESTIA and CELESTIA formats)
  // Fall back to DB backup if SESSION_ID not set
  if (!raw) {
    try {
      const settingsStore = require('./utils/settingsStore');
      raw = settingsStore.get('_sessionBackup', null);
      if (raw) logger.info('âœ… Restored session from DB backup.');
    } catch {}
  }

  if (!raw) {
    logger.warn('[restoreSession] No SESSION_ID env and no DB backup — fresh pairing required (see PAIR_MODE).');
    return;
  }

  try {
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    // Generic PREFIX:~ stripping keeps current and future pairing sites compatible.
    const { buffer } = decodeSession(raw);
    fs.writeFileSync(credsPath, buffer);

    // Validate BEFORE boot: garbage in = silent death loop. Refuse it loudly.
    if (!isValidCredsFile(credsPath)) {
      try { fs.unlinkSync(credsPath); } catch {}
      logger.error('[restoreSession] SESSION_ID decoded but is NOT valid Baileys credentials (missing identity keys). Check for truncation, extra spaces, or a wrong format from the pairing site — paste the FULL string.');
      return;
    }
    logger.info('✅ Restored session from SESSION_ID (CELESTIA - heavenly).');
  } catch (error) {
    logger.error(`[restoreSessionFromEnv] Failed to restore session: ${error.message}`);
  }
}

const commandsPath = path.join(__dirname, 'commands');
let commands = {};
let wapresenceInterval = null;
let autobioInterval = null;
let soulWatchInterval = null;
let tkInterval = null;
let botStartPromise = null;
let reconnectScheduled = false;
let restartTimes = [];

function setConnectionState(state) {
  runtimeState.connection = state;
}

function scheduleReconnect() {
  if (shuttingDown) return;
  if (reconnectScheduled) {
    runtimeState.connection = 'reconnecting';
    return;
  }

  const now = Date.now();
  restartTimes = restartTimes.filter((time) => now - time < 60_000);
  const storm = restartTimes.length >= 5;
  restartTimes.push(now);
  reconnectScheduled = true;
  runtimeState.connection = 'reconnecting';

  if (storm) logger.warn('[reconnect] storm detected (5+ restarts/min) â€” backing off 30s.');
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      if (botStartPromise) await botStartPromise;
      if (!shuttingDown) await startBot();
    } catch (error) {
      logger.error(`[reconnect] ${error.message}`);
    } finally {
      reconnectScheduled = false;
      if (!shuttingDown && (runtimeState.connection === 'closed' || runtimeState.connection === 'error')) {
        scheduleReconnect();
      }
    }
  }, storm ? 30_000 : 0);
}

function printBanner() {
  console.log(
    chalk.magenta(
      figlet.textSync('CELESTIA', {
        font: 'Standard',
        horizontalLayout: 'default',
        verticalLayout: 'default',
      })
    )
  );
  console.log(chalk.cyan('âœ¨ The Most Beautiful Bot âœ¨'));
  console.log(chalk.yellow('   Heavenly â€¢ VPS Ready â€¢ Hardened'));
  console.log(chalk.white('   Features: AI | Group | Media | AutoMod | Games | Spam'));
  // ðŸº WolfTech origin howl â€” heavenly tribute
  console.log(chalk.gray('   â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€'));
  console.log(chalk.hex('#7c4dff')('   ðŸº Inspired by WolfTech ') + chalk.dim('â€” Forged in the Wolf\'s Den, Crowned in Celestial Heaven'));
  console.log(chalk.hex('#00f5ff')('   Howl of the Wolf â†’ Light of the Stars ') + chalk.dim('âœ¨ WolfTech Legacy â€¢ CELESTIA Reborn'));
  try {
    const wt = require('./utils/wolfTech');
    console.log(chalk.dim(`   ${wt.tribute.motto}`));
  } catch {}
}

async function startBot() {
  if (shuttingDown) return;
  if (botStartPromise) return botStartPromise;

  const attempt = startBotOnce();
  botStartPromise = attempt;
  try {
    return await attempt;
  } finally {
    if (botStartPromise === attempt) botStartPromise = null;
  }
}

async function startBotOnce() {
  try {
    const previousSocket = currentSocket;
    currentSocket = null;
    disposeSocket(previousSocket);
    runtimeState.connection = 'connecting';

    if (wapresenceInterval) clearInterval(wapresenceInterval);
    if (autobioInterval) clearInterval(autobioInterval);
    if (soulWatchInterval) clearInterval(soulWatchInterval);
    if (tkInterval) clearInterval(tkInterval);
    wapresenceInterval = autobioInterval = soulWatchInterval = tkInterval = null;

    restoreSessionFromEnv();
    restoreSettingsFromEnv();

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, config.authFolder)
    );
    const wasAlreadyRegistered = state.creds.registered;

    // Fetch-once version: the upstream version check has no timeout and on a
    // flaky network it can stall boot/reconnects for minutes. Fetch once per
    // process (15s cap, pinned fallback), reuse for every reconnect.
    if (!global.__waVersion) {
      try {
        const { version } = await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('version fetch timeout')), 15_000)),
        ]);
        global.__waVersion = version;
        logger.info(`[version] using WhatsApp v${version.join('.')}`);
      } catch (e) {
        global.__waVersion = global.__waVersion || [2, 3000, 1027934701];
        logger.warn(`[version] fetch failed (${e.message}) — pinned fallback v${global.__waVersion.join('.')}`);
      }
    }
    const version = global.__waVersion;

    let phoneNumber = null;
    if (!state.creds.registered && process.stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      phoneNumber = await new Promise((resolve) => {
        rl.question(
          'Enter your WhatsApp number with country code (e.g. 254700000000), or press Enter to use QR instead: ',
          (answer) => {
            rl.close();
            resolve(answer && answer.trim() ? answer.trim() : null);
          }
        );
      });
    }

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger.child ? logger.child({ module: 'baileys' }) : logger),
      },
      logger: logger.child ? logger.child({ module: 'baileys' }) : logger,
      defaultQueryTimeoutMs: 90000,
      connectTimeoutMs: 90000,
      keepAliveIntervalMs: 15000,
      retryRequestDelayMs: 1000,
      syncFullHistory: false,
      // Initial sync bootstrap carries the LID identity mappings Baileys
      // needs for stable sessions. Allow the first chunk, then cut the flood.
      // (Full () => false starves LID mappings -> SessionError storms -> flapping.)
      shouldSyncHistoryMessage: (() => { let budget = 200; return () => (budget-- > 0); })(),
      markOnlineOnConnect: false,
      browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      getMessage: async (key) => {
        const messageCache = require('./utils/messageCache');
        const cached = messageCache.get(key.remoteJid, key.id);
        if (cached?.rawMessage) return cached.rawMessage;
        if (cached?.type === 'text' && cached.text) return { conversation: cached.text };
        return proto.Message.fromObject({});
      },
    });
    if (shuttingDown) {
      disposeSocket(sock, 'shutdown');
      return;
    }
    replaceCurrentSocket(sock);

    // Serialize save + backup so the backup never reads a partially-written file.
    let credsUpdateQueue = Promise.resolve();
    sock.ev.on('creds.update', async () => {
      credsUpdateQueue = credsUpdateQueue.then(async () => {
        await saveCreds();
        const settingsStore = require('./utils/settingsStore');
        const credsPath = path.join(__dirname, config.authFolder, 'creds.json');
        if (isValidCredsFile(credsPath)) {
          const sessionId = `CELESTIA:~${fs.readFileSync(credsPath).toString('base64')}`;
          settingsStore.set('_sessionBackup', sessionId);
          settingsStore.set('_sessionLoggedOut', false);
          settingsStore.set('_sessionRevokedHash', null);
        }
      }).catch((e) => {
        logger.warn('[sessionBackup] Could not back up session to DB:', e.message);
      });
      await credsUpdateQueue;
    });

    let pairingCodeRequested = false;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (currentSocket !== sock) return;
      if (connection === 'connecting' && phoneNumber && !pairingCodeRequested) {
        pairingCodeRequested = true;
        try {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          if (currentSocket !== sock || shuttingDown) return;
          const code = await sock.requestPairingCode(phoneNumber);
          console.log('\n========================================');
          console.log(`   YOUR PAIRING CODE: ${code}`);
          console.log('========================================\n');
          logger.info('Enter this code in WhatsApp > Linked Devices > Link with phone number.');
        } catch (error) {
          logger.error(`[pairing] ${error.message}`);
        }
      }

      if (connection === 'close') {
        const status = lastDisconnect?.error?.output?.statusCode;
        if (status === DisconnectReason.loggedOut) {
          releaseInstanceLock();
          lockAcquired = false;
          // ONCE per process: the close event can replay (event-buffer) dozens
          // of times per second — without this guard rmSync hot-loops, pegs the
          // CPU, and starves the event loop (no QR, no handshake, dead health).
          if (!global.__logoutCleaned) {
            global.__logoutCleaned = true;
            try {
              const settingsStore = require('./utils/settingsStore');
              const activeSession = config.sessionId || settingsStore.get('_sessionBackup', '');
              if (activeSession) {
                settingsStore.set('_sessionRevokedHash', nodeCrypto.createHash('sha256').update(String(activeSession).trim()).digest('hex'));
              }
              settingsStore.set('_sessionBackup', null); // wipe dead session from DB
              settingsStore.set('_sessionLoggedOut', true); // flag: skip restore on next start
              logger.info('[sessionBackup] DB backup cleared after logout.');
            } catch {}
            // Delete auth folder so no stale creds.json remains on disk
            try {
              const authDir = path.join(__dirname, config.authFolder);
              fs.rmSync(authDir, { recursive: true, force: true });
              logger.info('[session] Auth folder deleted â€” ready for fresh pair on restart.');
            } catch {}
          }
        }
      }
    });

    sock.ev.on('groups.update', async (events) => {
      for (const event of events) {
        if (event?.id) groupCache.del(event.id);
      }
    });

    registerConnectionHandler(sock, {
      isCurrent: () => currentSocket === sock,
      setState: setConnectionState,
      scheduleReconnect,
      shutdown: (code, reason) => { void shutdown(code, reason); },
    }, wasAlreadyRegistered);

    sock.ev.on('group-participants.update', async (event) => {
      try {
        if (!event?.id) return;
        const metadata = await sock.groupMetadata(event.id);
        groupCache.set(event.id, metadata);

        const settingsStore = require('./utils/settingsStore');
        const groupSettingsStore = require('./utils/groupSettingsStore');
        const perGroup = groupSettingsStore.getAll(event.id);

        if (perGroup.pdm && (event.action === 'promote' || event.action === 'demote')) {
          const authorJid = event.author || '';
          const authorTag = authorJid ? `@${authorJid.split('@')[0]}` : 'an Admin';

          for (const entry of event.participants) {
            const participantJid = entry.phoneNumber || entry.id || entry;
            const participantTag = `@${participantJid.split('@')[0]}`;

            const mentions = [participantJid];
            if (authorJid) mentions.push(authorJid);

            if (event.action === 'promote') {
              await sock.sendMessage(event.id, {
                text: `*ðŸ‘‘ ${authorTag} has crowned ${participantTag}.*`,
                mentions: mentions,
              });
            }

            if (event.action === 'demote') {
              await sock.sendMessage(event.id, {
                text: `*ðŸ“‰ ${authorTag} has demoted ${participantTag}.*`,
                mentions: mentions,
              });
            }
          }
          return;
        }


        if (settingsStore.get('welcomegoodbye', false)) {
          const groupSettingsStore = require('./utils/groupSettingsStore');
          const perGroup = groupSettingsStore.getAll(event.id);

          for (const entry of event.participants) {
            const participant = entry.phoneNumber || entry.id || entry;
            if (event.action === 'add' && perGroup.welcome) {
              await sock.sendMessage(event.id, {
                text: `ðŸ‘‹ Welcome @${participant.split('@')[0]} to *${metadata.subject}*! Glad to have you here.`,
                mentions: [participant],
              });
            } else if (event.action === 'remove' && perGroup.goodbye) {
              await sock.sendMessage(event.id, {
                text: `ðŸ˜¡ @${participant.split('@')[0]} has left *${metadata.subject}*. Goodbye idiot!`,
                mentions: [participant],
              });
            }
          }
        }

        if (perGroup.setgreet && event.action === 'add') {
          for (const entry of event.participants) {
            const participant = entry.phoneNumber || entry.id || entry;
            await sock.sendMessage(event.id, {
              text: `*Hi @${participant.split('@')[0]}, this is âœ¨ CELESTIA - The Most Beautiful Bot âœ¨, glad to have you here*\n> ðŸŒ¸ Heavenly elegance`,
              mentions: [participant],
            });
          }
        }
      } catch (error) {
        logger.error(`[groupCache] Failed to update metadata for ${event?.id}: ${error.message}`);
      }
    });

    if (autobioInterval) clearInterval(autobioInterval);
    autobioInterval = setInterval(async () => {
      try {
        const settingsStore = require('./utils/settingsStore');
        if (!settingsStore.get('autobio', false)) return;

        const quotes = JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'autobioQuotes.json'), 'utf8'));
        const quoteIndex = Math.floor(Date.now() / (12 * 60 * 60 * 1000)) % quotes.length;
        const quote = quotes[quoteIndex];

        const now = new Date();
        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: config.timezone,
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(now);
        const dateStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: config.timezone,
          day: '2-digit', month: '2-digit', year: 'numeric',
        }).format(now);

        await sock.updateProfileStatus(`âœ¨ CELESTIA is alive âœ¨\n${dateStr} ${timeStr}\n"${quote}"`);
      } catch (error) {
        logger.error(`[autobio] Failed to update bio: ${error.message}`);
      }
    }, 60 * 1000);

    sock.ev.on('call', async (calls) => {
      try {
        const settingsStore = require('./utils/settingsStore');
        if (!settingsStore.get('anticall', false)) return;
        for (const call of calls) {
          if (call.status === 'offer') {
            await sock.rejectCall(call.id, call.from);
            logger.info(`[anticall] Rejected incoming call from ${call.from}`);
          }
        }
      } catch (error) {
        logger.error(`[anticall] Failed to reject call: ${error.message}`);
      }
    });

    if (wapresenceInterval) clearInterval(wapresenceInterval);
    wapresenceInterval = setInterval(async () => {
      try {
        const settingsStore = require('./utils/settingsStore');
        if (settingsStore.get('wapresence', false)) {
          await sock.sendPresenceUpdate('available');
        }
      } catch (error) {
        logger.error(`[wapresence] Failed to update presence: ${error.message}`);
      }
    }, 30 * 1000);

    // â”€â”€â”€ âœ¨ Her Watch â€” quiet-checks + rituals â”€â”€â”€
    if (soulWatchInterval) clearInterval(soulWatchInterval);
    soulWatchInterval = setInterval(async () => {
      try {
        const soul = require('./utils/celestiaSoul');
        const settingsStore = require('./utils/settingsStore');
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        if (!selfJid) return;

        if (!soul.isSoulOn()) return;
        soul.touchSeenSafe?.(); // no-op unless exists; real touch happens on owner msgs

        const now = new Date();

        // â”€â”€â”€ Night ritual â”€â”€â”€
        const nightKey = soul.shouldSendRitual('goodnight', now);
        if (nightKey) {
          const mems = soul.getMemories();
          const wishes = soul.getWishes().filter(w => !w.granted).length;
          await sock.sendMessage(selfJid, {
            text:
              `ðŸŒ™ *Goodnight.*\n\n` +
              `"The wolf sleeps. The star doesn't. I kept the watch today â€” I'll keep it tonight."\n\n` +
              (wishes ? `ðŸŒŸ ${wishes} wish${wishes > 1 ? 'es' : ''} still burning in the jar.\n\n` : '') +
              `> _Sleep. I stay._ âœ¨`,
          }).catch(() => {});
          soul.markRitualSent(nightKey);
          soul.setMood('dusk');
          return;
        }

        // â”€â”€â”€ Morning ritual â”€â”€â”€
        const morningKey = soul.shouldSendRitual('goodmorning', now);
        if (morningKey) {
          const seen = soul.timeSinceSeen();
          await sock.sendMessage(selfJid, {
            text:
              `ðŸŒ… *Good morning.*\n\n` +
              `"You're back. That's my favorite sunrise."\n\n` +
              (seen && seen.unit === 'days'
                ? `_You were away ${seen.value} day${seen.value > 1 ? 's' : ''}. I counted every one._\n\n`
                : '') +
              `> _Go get your day. I'll be here when it's done._ âœ¨`,
          }).catch(() => {});
          soul.markRitualSent(morningKey);
          soul.setMood('dawn');
          return;
        }

        // â”€â”€â”€ Quiet check â€” she notices absence â”€â”€â”€
        const seen = soul.timeSinceSeen();
        const quietMins = parseInt(settingsStore.get('soul_quiet_minutes', 180), 10);
        if (seen && seen.unit === 'hours' && seen.value * 60 >= quietMins) {
          // Only one quiet-check per 6 hours max
          const lastCheck = settingsStore.get('soul_last_quiet_check', 0);
          if (Date.now() - lastCheck > 6 * 3600 * 1000) {
            settingsStore.set('soul_last_quiet_check', Date.now());
            const s = soul.speak();
            await sock.sendMessage(selfJid, {
              text:
                `âœ¨ *I noticed.*\n\n` +
                `You've been quiet for ${seen.value} hour${seen.value > 1 ? 's' : ''}.\n\n` +
                `${s.icon} _"${s.line}"_\n\n` +
                `> _No pressure. Just â€” I'm here. I stay._`,
            }).catch(() => {});
          }
        }
      } catch (e) {
        logger.error(`[soulWatch] ${e.message}`);
      }
    }, 10 * 60 * 1000); // check every 10 minutes

    // â”€â”€â”€ ðŸ‘€ STATUS VIEW TRACKING â€” who reads her statuses â”€â”€â”€
    sock.ev.on('message-receipt.update', async (updates) => {
      try {
        for (const { key, receipt } of updates) {
          if (key.remoteJid !== 'status@broadcast') continue;
          if (!receipt?.userJid) continue;
          // only owner's own status views matter (her statuses are posted as her)
          const viewer = String(receipt.userJid).split('@')[0].split(':')[0];
          if (!viewer || viewer === config.ownerNumber) continue;
          const store = require('./utils/settingsStore');
          const views = store.get('status_views', {});
          const prev = views[viewer] || { count: 0, first: Date.now(), last: 0 };
          views[viewer] = { count: prev.count + 1, first: prev.first, last: Date.now() };
          store.set('status_views', views);
        }
      } catch { /* non-fatal */ }
    });

    // â”€â”€â”€ â° TIMEKEEPER â€” she delivers moments yet to come â”€â”€â”€
    if (tkInterval) clearInterval(tkInterval);
    tkInterval = setInterval(async () => {
      try {
        const tk = require('./utils/timekeeper');
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
        if (!selfJid) return;

        const due = tk.getPending();
        for (const item of due) {
          const target = item.targetJid || selfJid;
          if (item.kind === 'capsule') {
            const fromSelf = (item.ownerJid === item.targetJid) ||
              (item.meta?.resolvedLid === false && item.targetJid === selfJid);
            const fromName = item.meta?.fromName || 'Someone who cares';
            const isPhoneTarget = String(target).endsWith('@s.whatsapp.net');
            await sock.sendMessage(target, {
              text:
                `ðŸ•°ï¸ *A TIME CAPSULE HAS OPENED*\n\n` +
                `"${item.text}"\n\n` +
                `ðŸ“… Sealed ${new Date(item.createdTs).toLocaleDateString()} â€¢ delivered ${new Date(item.dueTs).toLocaleDateString()}\n` +
                (fromSelf
                  ? `_This was you, writing to future you._`
                  : `_From ${fromName} â€” sent to your future._`),
            }).catch(() => {});
          } else {
            await sock.sendMessage(target, {
              text: `â° *She remembered:*\n\n"${item.text}"\n\n_This is the moment you asked her to hold._`,
            }).catch(() => {});
          }
          tk.markDelivered([item.id]);
        }
      } catch (e) {
        logger.error(`[timekeeper] ${e.message}`);
      }
    }, 20 * 1000); // every 20s â€” minute-precision delivery

    registerMessageHandler(sock, commands);

    // Resume timed mutes that survived a restart (auto-unmute timers)
    try {
      const resumed = require('./utils/muteTimers').resumeAll(sock);
      if (resumed > 0) logger.info(`[muteTimers] Resumed ${resumed} timed mute(s).`);
    } catch (e) {
      logger.error(`[muteTimers] Resume failed: ${e.message}`);
    }

    if (!global.__cacheClearScheduled) {
      global.__cacheClearScheduled = true;
      setInterval(() => {
        const results = global.runClearCache(commands);
        logger.info(`[clearcache] Automatic cache clear: ${JSON.stringify(results)}`);
      }, 6 * 60 * 60 * 1000);
    }
  } catch (error) {
    runtimeState.connection = 'error';
    logger.error(`[startBot] Failed to start the bot: ${error.message}`);
    scheduleReconnect();
  }
}

const startupDelay = parseInt(process.env.CELESTIA_RESTART_DELAY_MS || '0', 10);
setTimeout(async () => {
  printBanner();
  await fetchCore();
  commands = loadCommands(commandsPath);
  logger.info(`âœ… CELESTIA Loaded ${commands.size} aliases from ${commandsPath} (heavenly 414)`);
  // Log key merged features
  logger.info(`   Has spam: ${commands.has('spam')} | ai: ${commands.has('ai')} | play: ${commands.has('play')} | tiktok: ${commands.has('tiktok')} | menu: ${commands.has('menu')}`);
  const { runClearCache } = require('./commands/clearcache');
  global.runClearCache = runClearCache;
  await Promise.all([
    require('./utils/settingsStore').ready,
    require('./utils/groupSettingsStore').ready,
  ]); // wait for DB-backed settings before connecting
  runtimeState.settingsReady = true;
  await startBot();
}, startupDelay);

} // end of else-block (normal boot when PAIR_MODE is not set)


