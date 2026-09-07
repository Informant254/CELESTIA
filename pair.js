/**
 * pair.js — session setup: SESSION_ID first, pairing code only as fallback.
 *
 * 1. If SESSION_ID env is set (or a session already exists) → restore it,
 *    print SESSION_SAVED, exit. No code, no pairing dance.
 * 2. Otherwise prompt once: paste a SESSION_ID, or press Enter to get a
 *    pairing code for OWNER_NUMBER (written to pair-code.txt).
 * Exits once linked (creds saved) or after 5 minutes.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const readline = require('readline');

function decodeSessionId(raw) {
  // Same prefix support as index.js restoreSessionFromEnv
  const cleaned = String(raw).trim().replace(/^(CELESTIA:~|WOLF:~|CELESTIA:~|MERGED:~|CELESTIA:~)/, '');
  return Buffer.from(cleaned, 'base64');
}

function saveSessionFromId(raw) {
  const authDir = path.join(__dirname, 'auth_info_baileys');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'creds.json'), decodeSessionId(raw));
}

function askOnce(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve('');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const logger = require('./utils/logger');

const PHONE = process.env.OWNER_NUMBER || '254118266549';
const CODE_FILE = path.join(__dirname, 'pair-code.txt');
const LINKED_FILE = path.join(__dirname, 'pair-linked.txt');

(async () => {
  // ── SESSION_ID first: env, then one interactive paste. No code needed. ──
  const existing = path.join(__dirname, 'auth_info_baileys', 'creds.json');
  const envSession = (process.env.SESSION_ID || '').trim();
  if (envSession && !fs.existsSync(existing)) {
    try {
      saveSessionFromId(envSession);
      console.log('SESSION_SAVED — restored from SESSION_ID env. No pairing code needed.');
      process.exit(0);
    } catch (e) {
      console.log('SESSION_ID invalid (' + e.message + ') — falling through to prompt/code flow.');
    }
  } else if (envSession && fs.existsSync(existing)) {
    console.log('SESSION_SAVED — session already present, nothing to do.');
    process.exit(0);
  }

  if (!fs.existsSync(existing)) {
    const pasted = await askOnce('Paste SESSION_ID (or press Enter to get a pairing code instead): ');
    if (pasted) {
      try {
        saveSessionFromId(pasted);
        console.log('SESSION_SAVED — pasted session written. No pairing code needed. Start the bot with: node index.js');
        process.exit(0);
      } catch (e) {
        console.log('That SESSION_ID did not decode (' + e.message + ') — continuing to pairing-code flow.');
      }
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    markOnlineOnConnect: false,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (connection === 'connecting') {
      // request the code as soon as the socket is live
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(PHONE);
          fs.writeFileSync(CODE_FILE, code);
          console.log('PAIRING_CODE: ' + code);
          logger.info('Pairing code written to pair-code.txt — enter it in WhatsApp > Linked Devices > Link with phone number');
        } catch (e) {
          logger.error('Pairing code request failed: ' + e.message);
          fs.writeFileSync(CODE_FILE, 'ERROR: ' + e.message);
        }
      }, 3000);
    }

    if (connection === 'open') {
      fs.writeFileSync(LINKED_FILE, 'linked at ' + new Date().toISOString());
      console.log('LINKED_OK');
      // small settle delay so creds flush, then exit — main bot takes over
      setTimeout(() => process.exit(0), 4000);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === 401 || code === 403) {
        console.log('DENIED — restart this script for a fresh code.');
        setTimeout(() => process.exit(1), 2000);
      }
      // else: stay alive — script's 5-min timeout governs
    }
  });

  // 5-minute window then exit
  setTimeout(() => {
    if (!fs.existsSync(LINKED_FILE)) {
      console.log('TIMEOUT — no link within 5 minutes.');
      process.exit(2);
    }
  }, 5 * 60 * 1000);
})();
