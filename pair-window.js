/**
 * pair-window.js — THE WINDOW THAT NEVER VANISHES
 *
 * Prints a giant pairing code directly in the visible console,
 * and if WhatsApp rejects/reconnects (401 etc), it re-requests
 * a fresh code and re-prints — the window STAYS OPEN until
 * linked or you close it. Max 25 code attempts, then rests.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const PHONE = process.env.OWNER_NUMBER || '254118266549';
const AUTH = path.join(__dirname, 'auth_info_baileys');
const LINKED = path.join(__dirname, 'pair-linked.txt');

const bigLine = (c) => console.log('████████████████████████████████████████');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function start() {
  if (fs.existsSync(LINKED)) fs.unlinkSync(LINKED);
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, child: () => ({ info(){}, error(){}, warn(){}, debug(){} }) }) },
    logger: { info: () => {}, error: (e) => console.log('  log:', (e?.msg || '').slice(0, 70)), warn: () => {}, debug: () => {}, child: () => ({ info(){}, error(){}, warn(){}, debug(){} }) },
    markOnlineOnConnect: false,
    browser: ['Ubuntu', 'Chrome', '120.0.6099.130'],
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });

  sock.ev.on('creds.update', saveCreds);

  let attempts = 0;
  let codeTimer = null;

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'connecting') {
      // request code shortly after socket is up
      clearTimeout(codeTimer);
      codeTimer = setTimeout(async () => {
        try {
          attempts++;
          if (attempts > 25) {
            console.log('\n!! 25 codes used. Resting 10 minutes — leave this window open. !!');
            await wait(10 * 60 * 1000);
            attempts = 0;
          }
          const code = await sock.requestPairingCode(PHONE);
          console.log('\n');
          bigLine();
          console.log(`   PAIRING CODE (attempt ${attempts}):`);
          console.log('');
          console.log(`        >>>  ${code}  <<<`);
          console.log('');
          console.log('   WhatsApp > Linked Devices > Link a Device');
          console.log('   > "Link with phone number instead"');
          console.log('');
          console.log('   ...this window stays open. Fresh code auto-refreshes.');
          bigLine();
          console.log('');
        } catch (e) {
          console.log('  code request failed:', (e?.message || '').slice(0, 60), '— retrying...');
        }
      }, 4000);
    }

    if (connection === 'open') {
      console.log('\n');
      console.log('████████████████████████████████████████');
      console.log('   ✅✅✅ LINKED SUCCESSFULLY ✅✅✅');
      console.log('████████████████████████████████████████');
      console.log('   Session saved. You can close this window.');
      fs.writeFileSync(LINKED, 'linked ' + new Date().toISOString());
      setTimeout(() => process.exit(0), 5000);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      console.log(`  (reconnect — status ${status}. Re-requesting code...)`);
      // NEVER exit. Retry with backoff.
      await wait(status === 428 ? 15000 : 5000);
      if (status === DisconnectReason.loggedOut || status === 401) {
        // server says not registered — that's FINE while pairing. Fresh state, retry.
        try { fs.rmSync(AUTH, { recursive: true, force: true }); } catch {}
      }
      start().catch(() => setTimeout(start, 10000));
    }
  });
}

console.log('============================================');
console.log('   CELESTIA PAIRING WINDOW — always open');
console.log(`   Number: ${PHONE}`);
console.log('   Codes auto-refresh. Take your time.');
console.log('============================================');
start().catch((e) => {
  console.log('fatal:', e.message, '— restarting in 15s');
  setTimeout(() => start(), 15000);
});
