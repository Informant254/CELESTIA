const config = require('../config/config');
const { isDev } = require('./isDev');

// LID-aware identity check.
// WhatsApp's new addressing gives each account a LID (e.g. 1849...@lid)
// alongside the phone number. Group messages may arrive with the LID only,
// so we compare EVERY jid field against the owner number AND any known
// LID mapping. The mapping is learned three ways so it can never be empty:
//   1. sessionOwner records sock.user.lid at every connect (+ persisted)
//   2. self-learned below from any fromMe DM carrying both forms
//   3. persisted in settings store (survives restarts)
function normalize(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function collectCandidates(msg) {
  return [
    msg?.participant,
    msg?.key?.participantPn,
    msg?.key?.participantAlt,
    msg?.key?.participant,
    msg?.key?.remoteJidAlt,
    msg?.key?.remoteJid,
  ].filter(Boolean).map(normalize);
}

function knownOwnerLids() {
  const lids = new Set();
  if (globalThis.__ownerLid) lids.add(normalize(globalThis.__ownerLid));
  try {
    const stored = require('./settingsStore').get('ownerLid', '');
    if (stored) lids.add(normalize(stored));
  } catch {}
  return [...lids].filter(Boolean);
}

function isOwner(msg) {
  if (!msg?.key) return false;

  // Self-learn our own LID<->PN pairing: any fromMe DM that carries both
  // forms (remoteJid @lid + remoteJidAlt PN) is definitive proof.
  try {
    if (msg.key.fromMe && msg.key.remoteJid && msg.key.remoteJidAlt) {
      const lid = normalize(msg.key.remoteJid);
      const pn = normalize(msg.key.remoteJidAlt);
      if (lid && pn && pn === normalize(config.ownerNumber || '')) {
        if (globalThis.__ownerLid !== lid) {
          globalThis.__ownerLid = lid;
          try { require('./settingsStore').set('ownerLid', lid); } catch {}
        }
      }
    }
  } catch {}

  if (msg.key.fromMe) return true;

  const candidates = collectCandidates(msg);

  // owner phone number (e.g. 254118266549)
  const ownerPn = normalize(config.ownerNumber || '');
  if (ownerPn && candidates.includes(ownerPn)) return true;

  // owner LID (e.g. 184941979672752)
  for (const lid of knownOwnerLids()) {
    if (candidates.includes(lid)) return true;
  }

  return isDev(msg);
}

module.exports = { isOwner };
