/**
 * pairing-site.js â€” CELESTIA public pairing station ðŸŒ
 *
 * Run alongside the main bot (or standalone):
 *   node pairing-site.js
 *
 * Serves a beautiful web page where anyone can:
 *   1. Enter their WhatsApp number
 *   2. Get an 8-digit pairing code
 *   3. Enter it in their WhatsApp
 *   4. Receive their SESSION_STRING (paste into deployment env)
 *
 * Port: PAIRING_PORT (default 3001)
 * This is how other people deploy and use her.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');

const app = express();
// Railway/Render inject PORT; use it when present (single-service deployments).
// Local/Docker: PAIRING_PORT keeps the station separate from the bot.
const PORT = process.env.PAIRING_PORT || process.env.PORT || 3001;
const PAIRING_DIR = path.join(__dirname, 'pairing_sessions');
if (!fs.existsSync(PAIRING_DIR)) fs.mkdirSync(PAIRING_DIR, { recursive: true });

const silentLogger = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
  child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {} }),
};

const activeSockets = new Map(); // phone -> sock

async function getSocket(phone) {
  if (activeSockets.has(phone)) {
    const existing = activeSockets.get(phone);
    if (existing.ready) return existing;
  }
  return null;
}

async function startPairingSession(phone) {
  // retry loop: sockets flap during pairing attempts; never give up on flap
  const MAX_TRIES = 4;
  let lastErr = 'unknown';

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const result = await startPairingAttempt(phone, attempt);
      if (result) return result;
      // linked=true resolves via status polling; code attempt returns session
    } catch (e) {
      lastErr = e?.message || 'unknown';
      // clean any partial state before retry
      const sessionDir = path.join(PAIRING_DIR, crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16));
      try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
  throw new Error(lastErr);
}

async function startPairingAttempt(phone, attemptNo) {
  const sessionDir = path.join(PAIRING_DIR, crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16));
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silentLogger) },
    logger: silentLogger,
    markOnlineOnConnect: false,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });

  const session = { sock, ready: false, code: null, linked: false, sessionDir, saveCreds };
  sock.ev.on('creds.update', saveCreds);
  activeSockets.set(phone, session);

  return new Promise((resolve, reject) => {
    let settled = false;
    let codeAsked = false;
    const finishOk = () => { if (!settled) { settled = true; resolve(session); } };
    const finishErr = (msg) => { if (!settled) { settled = true; try { sock.end(undefined); } catch {} reject(new Error(msg)); } };

    const timer = setTimeout(() => {
      if (!session.ready) finishErr('timeout waiting for code â€” WhatsApp may be rate-limiting this number; wait 10 min and try again');
    }, 30000);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'connecting' || connection === 'connected') {
        // request the code once per socket, after a short settle
        if (!codeAsked) {
          codeAsked = true;
          setTimeout(async () => {
            try {
              const code = await sock.requestPairingCode(phone);
              session.code = code;
              session.ready = true;
              clearTimeout(timer);
              finishOk();
            } catch (e) {
              clearTimeout(timer);
              finishErr('code request failed: ' + (e?.message || 'unknown'));
            }
          }, 4000);
        }
      }

      if (connection === 'open') {
        session.linked = true;
        try {
          const credsPath = path.join(sessionDir, 'creds.json');
          if (fs.existsSync(credsPath)) {
            session.sessionString = 'CELESTIA:~' + fs.readFileSync(credsPath).toString('base64');
          }
        } catch {}
      }

      if (connection === 'close') {
        const status = lastDisconnect?.error?.output?.statusCode;
        // if we already have a code, the flap doesn't matter â€” keep session
        if (session.ready) return;
        // 401/428 while un-registered is normal during pairing attempts â€”
        // treat as retryable, not fatal
        clearTimeout(timer);
        finishErr('socket closed (status ' + status + ') â€” retrying');
      }
    });
  });
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// API
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RATE = new Map();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function rateLimited(ip) {
  const now = Date.now();
  const arr = (RATE.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  RATE.set(ip, arr);
  return arr.length >= 5; // 5 attempts/hour
}

app.post('/api/pair', async (req, res) => {
  const ip = req.ip || 'anon';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in an hour.' });

  const phone = String(req.body.phone || '').replace(/\D/g, '');
  if (phone.length < 8 || phone.length > 15) {
    return res.status(400).json({ error: 'Invalid number. Use full international format, digits only.' });
  }
  if (!RATE.has(ip)) RATE.set(ip, []);
  RATE.get(ip).push(Date.now());

  try {
    const session = await startPairingSession(phone);
    res.json({ ok: true, code: session.code });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/status', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const session = activeSockets.get(phone);
  if (!session) return res.status(404).json({ error: 'no session â€” start again' });
  if (session.linked && session.sessionString) {
    // cleanup session dir after handing string
    return res.json({ ok: true, linked: true, sessionString: session.sessionString });
  }
  res.json({ ok: true, linked: false });
});

app.get('/health', (req, res) => res.json({ ok: true, service: 'celestia-pairing' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ðŸŒ CELESTIA pairing station on http://0.0.0.0:${PORT}`);
});

