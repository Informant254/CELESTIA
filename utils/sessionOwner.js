/**
 * 🐺 SESSION OWNER — one-variable deployment
 *
 * The number that linked the session IS the owner.
 * When OWNER_NUMBER isn't in the env, this resolves the owner
 * from the live socket the moment she connects, so a deployment
 * only ever needs: SESSION_ID. Nothing else.
 */

const config = require('../config/config');
const logger = require('./logger');

let discovered = null;

/**
 * Call right after socket 'open'. Extracts the bot's own PN from the
 * session and adopts it as the owner when no OWNER_NUMBER was set.
 */
function adoptOwnerFromSession(sock) {
  try {
    if (process.env.OWNER_NUMBER) return false; // explicit env wins

    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    const me = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    if (!me || !me.endsWith('@s.whatsapp.net')) {
      logger.warn('[autoOwner] socket id not ready — owner stays default until next connect');
      return false;
    }

    const digits = me.split('@')[0].split(':')[0];
    if (digits.length < 8) return false;

    discovered = digits;
    config.ownerNumber = digits; // hot-swap the running config
    try {
      // Also record our LID so isOwner can match group messages that
      // arrive LID-only (new WhatsApp addressing). fromMe covers DMs,
      // but belt-and-suspenders for every path.
      const myLid = sock.user?.lid ? String(sock.user.lid) : '';
      if (myLid) globalThis.__ownerLid = myLid.split('@')[0].split(':')[0].replace(/\D/g, '');
    } catch {}
    logger.info(`dY?� [autoOwner] Owner adopted from session: ${digits}`);
    return true;
  } catch (e) {
    logger.error(`[autoOwner] ${e.message}`);
    return false;
  }
}

function getDiscovered() { return discovered; }

module.exports = { adoptOwnerFromSession, getDiscovered };
