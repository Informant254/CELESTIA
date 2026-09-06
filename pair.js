/**
 * pair.js — standalone pairing-code generator
 *
 * No typing needed. Connects fresh, requests the pairing code for
 * OWNER_NUMBER, writes it to pair-code.txt, waits for you to link.
 * Exits once linked (creds saved) or after 5 minutes.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
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
