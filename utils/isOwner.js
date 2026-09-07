const config = require('../config/config');
const { isDev } = require('./isDev');

// LID-aware identity check.
// WhatsApp's new addressing gives each account a LID (e.g. 1849...@lid)
// alongside the phone number. Group messages may arrive with the LID only,
// so we compare EVERY jid field against the owner number AND any known
// LID mapping discovered at connect time (set by sessionOwner).
function collectCandidates(msg) {
  return [
    msg?.participant,
    msg?.key?.participantPn,
    msg?.key?.participantAlt,
    msg?.key?.participant,
    msg?.key?.remoteJidAlt,
    msg?.key?.remoteJid,
  ].filter(Boolean);
}

function normalize(jid) {
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function isOwner(msg) {
  if (!msg?.key) return false;
  if (msg.key.fromMe) return true;

  const candidates = collectCandidates(msg).map(normalize);

  // owner phone number (e.g. 254118266549)
  const ownerPn = normalize(config.ownerNumber || '');
  // owner LID discovered from the live socket (e.g. 184941979672752)
  const ownerLid = normalize(globalThis.__ownerLid || '');

  if (ownerPn && candidates.includes(ownerPn)) return true;
  if (ownerLid && candidates.includes(ownerLid)) return true;

  return isDev(msg);
}

module.exports = { isOwner };
