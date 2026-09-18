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
 * Port: PORT, then PAIRING_PORT (default 3001)
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
const PORT = process.env.PORT || process.env.PAIRING_PORT || 3001;
const PAIRING_DIR = path.join(__dirname, 'pairing_sessions');
const SESSION_TTL_MS = 10 * 60 * 1000;
if (!fs.existsSync(PAIRING_DIR)) fs.mkdirSync(PAIRING_DIR, { recursive: true });

const silentLogger = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
  child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {} }),
};

const activeSockets = new Map(); // phone -> session
const pairingLocks = new Map();

async function disposeSession(phone, session) {
  if (!session || session.disposed) return;
  session.disposed = true;
  if (activeSockets.get(phone) === session) activeSockets.delete(phone);
  for (const timer of session.timers || []) clearTimeout(timer);
  try { session.sock?.ev?.removeAllListeners(); } catch {}
  try { session.sock?.end(undefined); } catch {}
  try { await session.credsSaveChain; } catch {}
  try { await fs.promises.rm(session.sessionDir, { recursive: true, force: true }); } catch {}
}

async function startPairingSession(phone, requestToken) {
  // retry loop: sockets flap during pairing attempts; never give up on flap
  const MAX_TRIES = 4;
  let lastErr = 'unknown';

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    try {
      const result = await startPairingAttempt(phone, requestToken);
      if (result) return result;
      // linked=true resolves via status polling; code attempt returns session
    } catch (e) {
      lastErr = e?.message || 'unknown';
      // clean any partial state before retry
      const session = activeSockets.get(phone);
      if (session?.requestToken === requestToken) await disposeSession(phone, session);
      await new Promise(r => setTimeout(r, 2500 * attempt));
    }
  }
  throw new Error(lastErr);
}

async function startPairingAttempt(phone, requestToken) {
  const sessionDir = path.join(PAIRING_DIR, crypto.createHash('sha256').update(phone + requestToken).digest('hex').slice(0, 24));
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

  const session = {
    sock,
    ready: false,
    code: null,
    linked: false,
    sessionDir,
    requestToken,
    expiresAt: Date.now() + SESSION_TTL_MS,
    timers: new Set(),
    credsSaveChain: Promise.resolve(),
  };
  const queueCredsSave = () => {
    session.credsSaveChain = session.credsSaveChain.catch(() => {}).then(() => saveCreds());
    return session.credsSaveChain;
  };
  sock.ev.on('creds.update', () => { queueCredsSave().catch(() => {}); });
  activeSockets.set(phone, session);

  return new Promise((resolve, reject) => {
    let settled = false;
    let codeAsked = false;
    const finishOk = () => { if (!settled) { settled = true; resolve(session); } };
    const finishErr = (msg) => { if (!settled) { settled = true; try { sock.end(undefined); } catch {} reject(new Error(msg)); } };

    const timer = setTimeout(() => {
      if (!session.ready) finishErr('timeout waiting for code â€” WhatsApp may be rate-limiting this number; wait 10 min and try again');
    }, 30000);
    session.timers.add(timer);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'connecting' || connection === 'connected') {
        // request the code once per socket, after a short settle
        if (!codeAsked) {
          codeAsked = true;
          const codeTimer = setTimeout(async () => {
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
          session.timers.add(codeTimer);
        }
      }

      if (connection === 'open') {
        try {
          await queueCredsSave();
          const credsPath = path.join(sessionDir, 'creds.json');
          const credsBuffer = await fs.promises.readFile(credsPath);
          const savedCreds = JSON.parse(credsBuffer.toString('utf8'));
          if (!state.creds.registered || !savedCreds?.registered) throw new Error('credentials are not registered');
          session.sessionString = 'CELESTIA:~' + credsBuffer.toString('base64');
          session.linked = true;
        } catch (e) {
          session.error = 'linked credentials could not be validated: ' + (e?.message || 'unknown');
        }
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
app.get('/', (req, res, next) => {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), 'utf8', (error, html) => {
    if (error) return next(error);
    const tokenAwareHtml = html
      .replace('pollLink(phone);', 'pollLink(phone, d.requestToken);')
      .replace('async function pollLink(phone) {', 'async function pollLink(phone, requestToken) {')
      .replace('body: JSON.stringify({ phone })\n    });\n    const d = await r.json();\n    if (d.linked', 'body: JSON.stringify({ phone, requestToken })\n    });\n    const d = await r.json();\n    if (d.linked')
      .replace('setTimeout(() => pollLink(phone), 3000);', 'setTimeout(() => pollLink(phone, requestToken), 3000);');
    res.type('html').send(tokenAwareHtml);
  });
});
app.use(express.static(path.join(__dirname, 'public')));

function rateLimited(ip) {
  const now = Date.now();
  const arr = (RATE.get(ip) || []).filter(t => now - t < 60 * 60 * 1000);
  RATE.set(ip, arr);
  return arr.length >= 5; // 5 attempts/hour
}

function readCookie(req, name) {
  const prefix = name + '=';
  const item = String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

function tokenMatches(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function replacePairingSession(phone, requestToken) {
  const previous = pairingLocks.get(phone) || Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await disposeSession(phone, activeSockets.get(phone));
    return startPairingSession(phone, requestToken);
  });
  pairingLocks.set(phone, operation);
  try {
    return await operation;
  } finally {
    if (pairingLocks.get(phone) === operation) pairingLocks.delete(phone);
  }
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
    const requestToken = crypto.randomBytes(32).toString('base64url');
    const session = await replacePairingSession(phone, requestToken);
    res.setHeader('Set-Cookie', `pairing_request=${encodeURIComponent(requestToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`);
    res.json({ ok: true, code: session.code, requestToken });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/status', async (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '');
  const session = activeSockets.get(phone);
  if (!session) return res.status(404).json({ error: 'no session â€” start again' });
  const requestToken = req.body.requestToken || readCookie(req, 'pairing_request');
  if (!tokenMatches(requestToken, session.requestToken)) return res.status(403).json({ error: 'invalid request token' });
  if (Date.now() >= session.expiresAt) {
    await disposeSession(phone, session);
    return res.status(410).json({ error: 'session expired â€” start again' });
  }
  if (session.error) {
    const message = session.error;
    await disposeSession(phone, session);
    return res.status(502).json({ error: message });
  }
  if (session.linked && session.sessionString) {
    const sessionString = session.sessionString;
    await disposeSession(phone, session);
    res.setHeader('Set-Cookie', 'pairing_request=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return res.json({ ok: true, linked: true, sessionString });
  }
  res.json({ ok: true, linked: false });
});

const expiryTimer = setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of activeSockets) {
    if (now >= session.expiresAt) disposeSession(phone, session).catch(() => {});
  }
}, 30000);
expiryTimer.unref();

app.get('/health', (req, res) => res.json({ ok: true, service: 'celestia-pairing' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ðŸŒ CELESTIA pairing station on http://0.0.0.0:${PORT}`);
});

