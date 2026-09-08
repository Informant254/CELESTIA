const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('../config/config');
const logger = require('../utils/logger');
const { autoJoinGroupOnce } = require('../utils/autoJoin');

/**
 * Registers the connection update listener on the given socket.
 *
 * @param {object} sock - the Baileys socket instance
 * @param {Function} startBot - reference to the bot startup function,
 *                              used to reconnect automatically when needed
 */
function registerConnectionHandler(sock, startBot, wasAlreadyRegistered) {
  // Live-QR state shared with the health server (declared in index.js)
  globalThis.__lastQR = null;
  globalThis.__lastQRAt = 0;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      globalThis.__lastQR = qr;
      globalThis.__lastQRAt = Date.now();
      logger.info('Scan the QR code below with WhatsApp to log in:');
      qrcode.generate(qr, { small: true });
      // Also save as PNG â€” easier to scan from a phone than terminal ASCII.
      try {
        require('qrcode').toFile(
          path.join(__dirname, '..', 'assets', 'qr.png'),
          qr,
          { width: 512, margin: 2 }
        ).then(() => logger.info('ðŸ“· QR also saved to assets/qr.png â€” open it and scan with your phone.')).catch(() => {});
      } catch {}
    }

    if (connection === 'connecting') {
      logger.info('Connecting to WhatsApp...');
    }

    if (connection === 'open') {
  logger.info('âœ… Connected to WhatsApp successfully!');

  try {
    // ðŸº ONE-VAR DEPLOY: the number that linked the session IS the owner
    require('../utils/sessionOwner').adoptOwnerFromSession(sock);
  } catch { /* non-fatal */ }

  try {
    const { groupCache } = require('../utils/groupCache');
    try {
      const allGroups = await sock.groupFetchAllParticipating();
      for (const [groupJid, metadata] of Object.entries(allGroups)) {
        groupCache.set(groupJid, metadata);
      }
      logger.info(`âœ… Warmed group metadata cache for ${Object.keys(allGroups).length} group(s).`);
    } catch (error) {
      logger.error(`[groupCache] Failed to warm cache on connect: ${error.message}`);
    }

    await autoJoinGroupOnce(sock);

    const selfJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;

    if (!selfJid) {
      logger.warn('[connection] sock.user not available yet â€” skipping startup/session-backup message this time.');
    } else {
      // Always send the startup message, whether this is a fresh pairing
      // or a reconnect using an existing session.
      // ðŸº WolfTech lineage included â€” heavenly tribute
      let wolfFooter = 'ðŸº WolfTech howled â†’ âœ¨ CELESTIA answered';
      try { wolfFooter = require('../utils/wolfTech').getRandomFooter(); } catch {}
      await sock.sendMessage(selfJid, {
        text: `âœ¨ *CELESTIA has started running* âœ¨\nðŸ’« The Most Beautiful Bot | VPS Ready â€¢ Hardened â€¢ Heavenly\nðŸº *Inspired by WolfTech* â€” _Forged in the Wolf's Den, Crowned in Celestial Heaven_\n> _${wolfFooter}_\n\nType *.menu* for heavenly commands â€¢ *.wolftech* for the origin howl`,
      }).catch((err) => logger.error('Failed to send startup message:', err));

      if (!wasAlreadyRegistered) {
        // First-ever pairing on this device (fresh QR scan or pairing code) â€”
        // additionally back up the session as a portable SESSION_ID and DM
        // it to the owner's own WhatsApp. That way, if this server's
        // storage is ever wiped or you move hosts, you can reconnect by
        // pasting this value into the SESSION_ID environment variable
        // instead of re-pairing.

        // Also reset the message-cutoff marker used by events/messages.js â€”
        // a fresh pairing means any old cutoff (from a previous session on
        // this same server) no longer applies. Deleting it here lets
        // messages.js set a brand new cutoff the moment it next loads.
        try {
          fs.unlinkSync(path.join(__dirname, '..', config.authFolder, '.first_boot_cutoff'));
          logger.info('[cutoff] Reset first-boot cutoff for new pairing.');
        } catch {}

        const credsPath = path.join(__dirname, '..', config.authFolder, 'creds.json');

        if (fs.existsSync(credsPath)) {
          const credsBuffer = fs.readFileSync(credsPath);
          const sessionId = `CELESTIA:~${credsBuffer.toString('base64')}`;

          await sock.sendMessage(selfJid, {
            text: `âœ… *CELESTIA linked successfully!* âœ¨\nðŸ’« The Most Beautiful Bot\n\nðŸ” *Session Backup* (CELESTIA format)\nSave this somewhere safe. Paste into SESSION_ID env to reconnect without re-pairing.\n\nâš ï¸ Treat like a password â€” anyone with it controls your WhatsApp.\n\n${sessionId}`,
          });

          logger.info('âœ… Session backup sent to your own WhatsApp number.');
        } else {
          logger.warn('[sessionBackup] creds.json not found yet â€” skipping session backup message.');
        }
      }
    }
  } catch (error) {
    logger.error(`[connection open] Failed during post-connect steps: ${error.message}`);
  }
}

    if (connection === 'close') {
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    // Reconnect circuit breaker: replayed close events (or a tight
    // die-loop) must never hot-loop startBot and starve the event loop.
    // Past 5 restarts in 60s, back off 30s before the next attempt.
    const now = Date.now();
    globalThis.__restartTimes = (globalThis.__restartTimes || []).filter(t => now - t < 60_000);
    const storm = globalThis.__restartTimes.length >= 5;
    const delayedStart = () => {
      globalThis.__restartTimes.push(Date.now());
      if (storm) {
        logger.warn('[reconnect] storm detected (5+ restarts/min) â€” backing off 30s.');
        setTimeout(() => { try { startBot(); } catch {} }, 30_000);
      } else {
        try { startBot(); } catch {}
      }
    };

    switch (statusCode) {
      case DisconnectReason.badSession:
        logger.error('âŒ Bad session file. Delete the auth folder and restart to re-link.');
        process.exit(1);
        break;

      case DisconnectReason.loggedOut:
        logger.error('âŒ Device logged out. Delete the auth folder / SESSION_ID and re-scan to re-link.');
        process.exit(1);
        break;

      case DisconnectReason.connectionReplaced:
        logger.error('âŒ Connection replaced â€” another session was opened elsewhere. Not auto-reconnecting.');
        process.exit(1);
        break;

      case DisconnectReason.connectionClosed:
        logger.warn('âš ï¸ Connection closed. Reconnecting...');
        delayedStart();
        break;

      case DisconnectReason.connectionLost:
        logger.warn('âš ï¸ Connection lost from server. Reconnecting...');
        delayedStart();
        break;

      case DisconnectReason.restartRequired:
        logger.warn('ðŸ”„ Restart required by WhatsApp. Reconnecting...');
        delayedStart();
        break;

      case DisconnectReason.timedOut:
        logger.warn('âš ï¸ Connection timed out. Reconnecting...');
        delayedStart();
        break;

      default:
        logger.warn(`âš ï¸ Connection closed (reason: ${statusCode || 'unknown'}). Reconnecting...`);
        delayedStart();
    }
  }
  });
}

module.exports = { registerConnectionHandler };
