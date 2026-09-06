/**
 * pair-qr.js — QR-based linking (no pairing code, no typing)
 *
 * Connects fresh, grabs the QR, saves it as a PNG image you can
 * open on screen and scan with your phone. Also writes it as
 * an SMS-style link. Waits for the link, saves creds, exits.
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
const QRCode = require('qrcode');
const logger = require('./utils/logger');

const LINKED_FILE = path.join(__dirname, 'pair-linked.txt');
const QR_PNG = path.join(__dirname, 'pair-qr.png');

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
    if (qr) {
      try {
        await QRCode.toFile(QR_PNG, qr, { width: 512, margin: 2 });
        console.log('QR_SAVED: ' + QR_PNG);
      } catch (e) {
        console.log('QR_SAVE_FAIL: ' + e.message);
      }
    }

    if (connection === 'open') {
      fs.writeFileSync(LINKED_FILE, 'linked at ' + new Date().toISOString());
      console.log('LINKED_OK');
      setTimeout(() => process.exit(0), 4000);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('CLOSED statusCode=' + code);
      if (code === 401) setTimeout(() => process.exit(1), 2000);
    }
  });

  setTimeout(() => {
    if (!fs.existsSync(LINKED_FILE)) {
      console.log('TIMEOUT_5MIN');
      process.exit(2);
    }
  }, 5 * 60 * 1000);
})();
