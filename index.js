globalThis.crypto = require('node:crypto').webcrypto;
require('dotenv').config();

// 🛡️ Settings guardian FIRST — restore anything a panel restart wiped,
// then keep rolling backups so the next kill loses nothing.
// (utils/settingsGuardian.js — restore fills gaps only, never clobbers.)
try {
  const guardian = require('./utils/settingsGuardian');
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
  const PAIR_PHONE = process.env.OWNER_NUMBER || '254118266549';
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
    pairLog('=== CELESTIA CLOUD PAIRING ===');
    pairLog('Watching for a pairing code for:', PAIR_PHONE);
    pairLog('Enter each code in: WhatsApp > Linked Devices > Link a Device > Link with phone number instead');
    pairLog('Codes refresh automatically. This never exits.');
    pairLog('===============================');

    let linked = false;
    let attempts = 0;

    while (!linked) {
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

        linked = await new Promise((resolve) => {
          let settled = false;
          const done = (v) => { if (!settled) { settled = true; resolve(v); } };
          let codeAsked = false;

          sock.ev.on('creds.update', saveCreds);

          sock.ev.on('connection.update', async ({ connection, qr }) => {
            if (qr) { lastQR = qr; lastQRAt = Date.now(); }
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
              pairLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              pairLog('!!!  LINKED SUCCESSFULLY       !!!');
              pairLog('!!!  Session saved in container !!!');
              pairLog('!!!  Remove PAIR_MODE now       !!!');
              pairLog('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
              done(true);
            }

            if (connection === 'close') {
              // calm: don't spam. resolve and let outer loop rest.
              setTimeout(() => done(false), 1000);
            }
          });

          // hard timeout per socket cycle: 90 seconds
          setTimeout(() => done(false), 90000);
        });
      } catch (e) {
        pairLog('cycle error:', (e?.message || '').slice(0, 80));
      }

      if (!linked) {
        try { if (sock) sock.end(undefined); } catch {}
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
  healthPair.get('/health', (req, res) => res.json({ ok: true, mode: 'pairing' }));
  // Live QR as PNG — open in a laptop browser, scan with the phone camera.
  // No typing, no 2-minute rush. Refreshes automatically with each new code.
  healthPair.get('/qr.png', async (req, res) => {
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
  healthPair.get('/qr', (req, res) => {
    const age = lastQR ? Math.round((Date.now() - lastQRAt) / 1000) : -1;
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15"><title>CELESTIA — Scan to Pair</title></head><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#030510;color:#cfeaff;font-family:sans-serif;text-align:center;padding:24px;"><div style="font-size:40px;">🐺</div><h1 style="letter-spacing:8px;">CELESTIA</h1><p>WhatsApp → Linked Devices → Link a Device → scan:</p>${lastQR ? `<img src="/qr.png" width="320" height="320" style="border-radius:16px;border:1px solid #00e5ff;">` : `<p>Waiting for QR… (first one lands ~90s after boot)</p>`}<p style="color:#8ea6c8;font-size:13px;">${age >= 0 ? `QR age: ${age}s — page auto-refreshes` : `codes still work too — check the deploy Logs tab`}</p></body></html>`);
  });
  healthPair.listen(process.env.PORT || 3000, '0.0.0.0', () => pairLog('health server up on /health'));

  // never crash the deploy: catch everything, keep container alive
  pairLoop().catch((e) => {
    pairLog('fatal:', e.message, '— restarting loop in 60s');
    setTimeout(() => pairLoop().catch(() => {}), 60000);
  });
} else {
// â•â•â•â•â•â•â•â•â•â•â• END PAIR_MODE â€” normal boot below â•â•â•â•â•â•â•â•â•â•â•

const config = require('./config/config');
const logger = require('./utils/logger');
const { loadCommands } = require('./utils/commandLoader');
const { registerConnectionHandler } = require('./events/connection');
const { registerMessageHandler } = require('./events/messages');
const { fetchCore } = require('./utils/fetchCore');
const { acquireLock, releaseLock } = require('./utils/instanceLock');
const fs = require('fs');
const express = require('express');

// Prevent two instances running at the same time â€” dual instances
// cause Bad MAC errors that corrupt the WhatsApp Signal session.
acquireLock();

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
healthApp.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), bot: 'CELESTIA', inspiredBy: 'WolfTech ðŸº', lineage: wolfTech.tribute.tagline }));
healthApp.get('/qr', (req, res) => {
  const qr = globalThis.__lastQR;
  const age = qr ? Math.round((Date.now() - globalThis.__lastQRAt) / 1000) : -1;
  const fresh = qr && age <= 50;
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="10"><title>CELESTIA — Live QR</title></head><body style="margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#030510;color:#cfeaff;font-family:sans-serif;text-align:center;padding:24px;"><div style="font-size:40px;">🐺</div><h1 style="letter-spacing:8px;margin:8px 0;">CELESTIA</h1>${fresh ? `<p style="color:#00e5ff;">● LIVE QR — ${age}s old — scan now</p><img src="/qr.png" width="340" height="340" style="border-radius:16px;border:2px solid #00e5ff;">` : `<p style="color:#ffcf6b;">Waiting for a fresh QR… (auto-refreshes every 10s)</p>`}<p style="color:#8ea6c8;font-size:13px;">WhatsApp → Linked Devices → Link a Device → scan this screen with your phone</p></body></html>`);
});
healthApp.get('/qr.png', async (req, res) => {
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
const HEALTH_PORT = config.dashboardPort;
healthApp.listen(HEALTH_PORT, '0.0.0.0', () => logger.info(`ðŸŒ CELESTIA Health server on 0.0.0.0:${HEALTH_PORT} -> /health /qr /wolftech ðŸº`));

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

function isValidCredsFile(credsPath) {
  // A usable Baileys creds.json must parse as JSON and carry identity keys.
  try {
    if (!fs.existsSync(credsPath)) return false;
    const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return !!parsed && typeof parsed === 'object' &&
      !!(parsed.noiseKey || parsed.signedIdentityKey) &&
      parsed.registrationId !== undefined;
  } catch {
    return false;
  }
}

function restoreSessionFromEnv() {
  const authDir = path.join(__dirname, config.authFolder);
  const credsPath = path.join(authDir, 'creds.json');

  // A corrupt creds.json from a bad SESSION_ID paste is worse than none:
  // quarantine it so we retry from env instead of looping on garbage.
  if (fs.existsSync(credsPath) && !isValidCredsFile(credsPath)) {
    try {
      const bad = credsPath + '.corrupt.' + Date.now();
      fs.renameSync(credsPath, bad);
      logger.error('[restoreSession] Existing creds.json is NOT valid Baileys credentials — quarantined to ' + bad + '. Will retry from SESSION_ID env.');
    } catch {}
  }

  if (fs.existsSync(credsPath)) return; // already have a session, nothing to restore

  // If last session was logged out, skip restoration â€” force a fresh pair
  try {
    const settingsStore = require('./utils/settingsStore');
    if (settingsStore.get('_sessionLoggedOut', false)) {
      logger.warn('[restoreSession] Last session was logged out. Skipping restoration â€” fresh pair required.');
      settingsStore.set('_sessionLoggedOut', false); // clear flag so next restart is normal
      return;
    }
  } catch {}

  // Try SESSION_ID env var first (supports both CELESTIA and CELESTIA formats)
  let raw = config.sessionId || process.env.SESSION_ID || process.env.WOLF_SESSION || '';

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
    // Support both CELESTIA:~ and wolf / CELESTIA prefixes, plus raw base64
    const cleaned = String(raw).trim().replace(/^(CELESTIA:~|WOLF:~|CELESTIA:~|MERGED:~|CELESTIA:~)/, '');
    const buffer = Buffer.from(cleaned, 'base64');
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
  try {
    restoreSessionFromEnv();
    restoreSettingsFromEnv();

    const { state, saveCreds } = await useMultiFileAuthState(
      path.join(__dirname, config.authFolder)
    );
    const wasAlreadyRegistered = state.creds.registered;

    const { version } = await fetchLatestBaileysVersion();

    let phoneNumber = null;
    if (!state.creds.registered && process.stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      phoneNumber = await new Promise((resolve) => {
        rl.question(
          'Enter your WhatsApp number with country code (e.g. 254118266549), or press Enter to use QR instead: ',
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

    // Save credentials whenever they change
    sock.ev.on('creds.update', saveCreds);

    // Back up session to DB on every credential update so a filesystem
    // wipe (container restart, redeploy) doesn't force a full re-pair.
    sock.ev.on('creds.update', async () => {
      try {
        const settingsStore = require('./utils/settingsStore');
        const credsPath = path.join(__dirname, config.authFolder, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const sessionId = `CELESTIA:~${fs.readFileSync(credsPath).toString('base64')}`;
          settingsStore.set('_sessionBackup', sessionId);
        }
      } catch (e) {
        logger.warn('[sessionBackup] Could not back up session to DB:', e.message);
      }
    });

    let pairingCodeRequested = false;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'connecting' && phoneNumber && !pairingCodeRequested) {
        pairingCodeRequested = true;
        try {
          await new Promise((resolve) => setTimeout(resolve, 3000));
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
          releaseLock();
          // ONCE per process: the close event can replay (event-buffer) dozens
          // of times per second — without this guard rmSync hot-loops, pegs the
          // CPU, and starves the event loop (no QR, no handshake, dead health).
          if (!global.__logoutCleaned) {
            global.__logoutCleaned = true;
            try {
              const settingsStore = require('./utils/settingsStore');
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

    sock.ev.on('groups.update', async ([event]) => {
      try {
        if (!event?.id) return;
        const metadata = await sock.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
      } catch (error) {
        logger.error(`[groupCache] Failed to update metadata for ${event?.id}: ${error.message}`);
      }
    });

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

    registerConnectionHandler(sock, startBot, wasAlreadyRegistered);
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
    logger.error(`[startBot] Failed to start the bot: ${error.message}`);
  }
}

process.on('uncaughtException', (error) => {
  logger.error(`[uncaughtException] ${error.stack || error.message}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`[unhandledRejection] ${reason}`);
});

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
  await require('./utils/settingsStore').ready; // wait for DB before connecting
  startBot();
}, startupDelay);

} // end of else-block (normal boot when PAIR_MODE is not set)


