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
    // ALWAYS learn + persist our LID first — LID-only group messages need it
    // to match the owner, regardless of whether OWNER_NUMBER env is set.
    try {
      const { jidNormalizedUser } = require('@whiskeysockets/baileys');
      const lidRaw = sock.user?.lid || null;
      const lid = lidRaw ? jidNormalizedUser(lidRaw).split('@')[0].split(':')[0].replace(/\D/g, '') : '';
      if (lid) {
        globalThis.__ownerLid = lid;
        try { require('./settingsStore').set('ownerLid', lid); } catch {}
        logger.info(`[autoOwner] Owner LID recorded: ${lid}`);
      }
    } catch {}
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
    logger.info(`dY?� [autoOwner] Owner adopted from session: ${digits}`);
    return true;
  } catch (e) {
    logger.error(`[autoOwner] ${e.message}`);
    return false;
  }
}

function getDiscovered() { return discovered; }

module.exports = { adoptOwnerFromSession, getDiscovered };
