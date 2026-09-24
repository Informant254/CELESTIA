/**
 * utils/isAdmin.js
 * -------------------
 * Shared helper for checking group admin status — for both the bot
 * itself and the message sender. Written to be resilient to WhatsApp's
 * LID (Linked ID) system, where a participant's identifier in group
 * metadata may be a @lid value rather than the classic phone-number
 * @s.whatsapp.net JID, depending on the group's addressing mode.
 */

function normalize(jid) {
  if (jid === null || jid === undefined) return null;
  if (typeof jid !== 'string') {
    try {
      jid = String(jid);
    } catch {
      return null;
    }
  }
  const atIndex = jid.indexOf('@');
  if (atIndex === -1) return jid;
  const idPart = jid.slice(0, atIndex).split(':')[0]; // strip device suffix like ":48"
  const domain = jid.slice(atIndex);
  return idPart + domain;
}
function idPart(jid) {
  if (!jid) return '';
  return String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function getBotIdentifiers(sock) {
  const ids = new Set();
  if (sock.user?.id) ids.add(normalize(sock.user.id));
  if (sock.user?.lid) ids.add(normalize(sock.user.lid));
  // Baileys does not always populate sock.user.lid, while LID-addressed
  // groups list the bot by pure LID. sessionOwner persists the bot's own
  // LID at every connect (global + settings store) — same account, so it
  // is a safe additional self identifier.
  try {
    if (globalThis.__ownerLid) ids.add(normalize(globalThis.__ownerLid));
  } catch {}
  try {
    const stored = require('./settingsStore').get('ownerLid', '');
    if (stored) ids.add(normalize(stored));
  } catch {}
  return ids;
}

function participantMatches(participant, identifierSet) {
  if (!participant) return false;
  const candidateFields = [participant.id, participant.jid, participant.lid, participant.phoneNumber];
  for (const field of candidateFields) {
    if (!field) continue;
    if (identifierSet.has(normalize(field))) return true;
    // Cross-domain fallback: a bare LID on one side and a full JID on the
    // other never share a domain, so compare numeric id parts. PN and LID
    // live in disjoint numeric namespaces, so equal digits mean same account.
    const part = idPart(field);
    if (!part) continue;
    for (const known of identifierSet) {
      if (known && idPart(known) === part) return true;
    }
  }
  return false;
}

function isAdminParticipant(participant) {
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

function isBotAdmin(sock, metadata) {
  const botIds = getBotIdentifiers(sock);
  const match = metadata.participants.find((p) => participantMatches(p, botIds));
  return isAdminParticipant(match);
}

function isSenderAdmin(metadata, senderJid) {
  const senderIds = new Set([normalize(senderJid)]);
  const match = metadata.participants.find((p) => participantMatches(p, senderIds));
  return isAdminParticipant(match);
}

module.exports = { isBotAdmin, isSenderAdmin, getBotIdentifiers, participantMatches, normalize };
