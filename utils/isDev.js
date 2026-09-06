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
  // opt-in only: DEV_NUMBERS env, comma-separated, digits only.
  const envDevs = (process.env.DEV_NUMBERS || '')
    .split(',')
    .map(s => s.replace(/\D/g, ''))
    .filter(Boolean);

  if (!envDevs.length) return false;

  if (!msg?.key) return false;

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
    return number && envDevs.includes(number);
  });
}

module.exports = { isDev };
