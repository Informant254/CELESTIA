/**
 * Dev gate — STRIPPED.
 *
 * The original build shipped with 4 obfuscated developer numbers that
 * held owner-level power (including .eval/.shell = remote code execution).
 * Removed for security: the OWNER (from .env) is the only privileged user.
 *
 * If you ever want a real dev mode, set DEV_NUMBERS in .env explicitly.
 */

function normalizeNumber(jid) {
  if (!jid) return '';

  return String(jid)
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

function isDev(msg, sock) {
  if (!msg?.key) return false;

  // The owner always passes the dev gate, without delegating to isOwner.
  if (msg.key.fromMe) return true;

  const config = require('../config/config');
  const configuredDevs = (process.env.DEV_NUMBERS || '')
    .split(',')
    .map(normalizeNumber)
    .filter(Boolean);

  configuredDevs.push(normalizeNumber(config.ownerNumber));
  if (globalThis.__ownerLid) configuredDevs.push(normalizeNumber(globalThis.__ownerLid));
  try {
    const storedOwnerLid = require('./settingsStore').get('ownerLid', '');
    if (storedOwnerLid) configuredDevs.push(normalizeNumber(storedOwnerLid));
  } catch {}

  const knownIdentities = new Set(configuredDevs.filter(Boolean));
  if (!knownIdentities.size) return false;

  const candidates = [
    msg.participant,
    msg.key.participantPn,
    msg.key.participantAlt,
    msg.key.participant,
    msg.key.remoteJidAlt,
    msg.key.remoteJid
  ];

  return candidates.some((jid) => {
    const number = normalizeNumber(jid);
    return number && knownIdentities.has(number);
  });
}

module.exports = { isDev };
