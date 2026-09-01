globalThis.crypto = require('node:crypto').webcrypto;
require('dotenv').config();
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

const config = require('./config/config');
const logger = require('./utils/logger');
const { loadCommands } = require('./utils/commandLoader');
const { registerConnectionHandler } = require('./events/connection');
const { registerMessageHandler } = require('./events/messages');
const { fetchCore } = require('./utils/fetchCore');
const { acquireLock, releaseLock } = require('./utils/instanceLock');
const fs = require('fs');
const express = require('express');

// Prevent two instances running at the same time — dual instances
// cause Bad MAC errors that corrupt the WhatsApp Signal session.
acquireLock();

// --- VPS Health Server (for Docker / UptimeRobot) ---
const healthApp = express();
healthApp.get('/', (req, res) => res.json({ status: 'CELESTIA ✨ The Most Beautiful Bot', uptime: process.uptime(), bot: config.botName, features: ['celestia','heavenly','vps','beautiful'] }));
healthApp.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), bot: 'CELESTIA' }));
healthApp.get('/qr', (req, res) => {
  // Baileys QR is printed in terminal; this endpoint confirms server is alive
  res.json({ message: 'Check terminal/logs for QR. If auth present, already logged in.', authExists: fs.existsSync(path.join(__dirname, config.authFolder, 'creds.json')) });
});
const HEALTH_PORT = config.dashboardPort;
healthApp.listen(HEALTH_PORT, '0.0.0.0', () => logger.info(`🌐 CELESTIA Health server on 0.0.0.0:${HEALTH_PORT} -> /health /qr`));

function restoreSettingsFromEnv() {
  const settingsPath = path.join(__dirname, 'config', 'botSettings.json');

  if (config.botSettingsData && !fs.existsSync(settingsPath)) {
    try {
      const raw = Buffer.from(config.botSettingsData, 'base64').toString('utf8');
      fs.writeFileSync(settingsPath, raw);
      logger.info('✅ Restored bot settings from BOT_SETTINGS_DATA.');
    } catch (error) {
      logger.error(`[restoreSettingsFromEnv] Failed to restore settings: ${error.message}`);
    }
  }
}

function restoreSessionFromEnv() {
  const authDir = path.join(__dirname, config.authFolder);
  const credsPath = path.join(authDir, 'creds.json');

  if (fs.existsSync(credsPath)) return; // already have a session, nothing to restore

  // If last session was logged out, skip restoration — force a fresh pair
  try {
    const settingsStore = require('./utils/settingsStore');
    if (settingsStore.get('_sessionLoggedOut', false)) {
      logger.warn('[restoreSession] Last session was logged out. Skipping restoration — fresh pair required.');
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
      if (raw) logger.info('✅ Restored session from DB backup.');
    } catch {}
  }

  if (!raw) return;

  try {
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    // Support both CELESTIA:~ and wolf / CELESTIA prefixes, plus raw base64
    const cleaned = raw.replace(/^(CELESTIA:~|WOLF:~|CELESTIA:~|MERGED:~|CELESTIA:~)/, '');
    const buffer = Buffer.from(cleaned, 'base64');
    fs.writeFileSync(credsPath, buffer);
    logger.info('✅ Restored session from SESSION_ID (CELESTIA - heavenly).');
  } catch (error) {
    logger.error(`[restoreSessionFromEnv] Failed to restore session: ${error.message}`);
  }
}

const commandsPath = path.join(__dirname, 'commands');
let commands = {};
let wapresenceInterval = null;
let autobioInterval = null;

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
  console.log(chalk.cyan('✨ The Most Beautiful Bot ✨'));
  console.log(chalk.yellow('   Heavenly • VPS Ready • Hardened'));
  console.log(chalk.white('   Features: AI | Group | Media | AutoMod | Games | Spam'));
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
          'Enter your WhatsApp number with country code (e.g. 254754574642), or press Enter to use QR instead: ',
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
      shouldSyncHistoryMessage: () => false,
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
            logger.info('[session] Auth folder deleted — ready for fresh pair on restart.');
          } catch {}
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
                text: `*👑 ${authorTag} has crowned ${participantTag}.*`,
                mentions: mentions,
              });
            }

            if (event.action === 'demote') {
              await sock.sendMessage(event.id, {
                text: `*📉 ${authorTag} has demoted ${participantTag}.*`,
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
                text: `👋 Welcome @${participant.split('@')[0]} to *${metadata.subject}*! Glad to have you here.`,
                mentions: [participant],
              });
            } else if (event.action === 'remove' && perGroup.goodbye) {
              await sock.sendMessage(event.id, {
                text: `😡 @${participant.split('@')[0]} has left *${metadata.subject}*. Goodbye idiot!`,
                mentions: [participant],
              });
            }
          }
        }

        if (perGroup.setgreet && event.action === 'add') {
          for (const entry of event.participants) {
            const participant = entry.phoneNumber || entry.id || entry;
            await sock.sendMessage(event.id, {
              text: `*Hi @${participant.split('@')[0]}, this is ✨ CELESTIA - The Most Beautiful Bot ✨, glad to have you here*\n> 🌸 Heavenly elegance`,
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

        await sock.updateProfileStatus(`✨ CELESTIA is alive ✨\n${dateStr} ${timeStr}\n"${quote}"`);
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

    registerConnectionHandler(sock, startBot, wasAlreadyRegistered);
    registerMessageHandler(sock, commands);

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
  logger.info(`✅ CELESTIA Loaded ${commands.size} aliases from ${commandsPath} (heavenly 414)`);
  // Log key merged features
  logger.info(`   Has spam: ${commands.has('spam')} | ai: ${commands.has('ai')} | play: ${commands.has('play')} | tiktok: ${commands.has('tiktok')} | menu: ${commands.has('menu')}`);
  const { runClearCache } = require('./commands/clearcache');
  global.runClearCache = runClearCache;
  await require('./utils/settingsStore').ready; // wait for DB before connecting
  startBot();
}, startupDelay);

