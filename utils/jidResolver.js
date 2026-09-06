/**
 * JID RESOLVER — turns LID jids into real phone jids
 *
 * Modern WhatsApp groups use LID addressing: ctx.participant often comes as
 * '267791999443191@lid' — an internal random ID, NOT a phone number.
 * Displaying or storing that = "weird numbers."
 *
 * This resolver tries, in order:
 *   1. contextInfo PN/alt fields (Baileys 7 hydrates these)
 *   2. plain @s.whatsapp.net participant (old addressing — use directly)
 *   3. group metadata LID→PN lookup (participants carry phoneNumber in Baileys 7)
 *   4. last resort: original jid (delivery may still work in LID groups)
 */

function isPhoneJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');
}

function isLidJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

/**
 * Resolve the real phone JID for a reply/mention target.
 * @param {object} sock  - Baileys socket
 * @param {object} msg   - incoming message (for group context)
 * @param {string|null} rawJid - the ctx.participant / mentioned jid
 * @returns {Promise<{jid: string, resolved: boolean}>}
 */
async function resolvePhoneJid(sock, msg, rawJid) {
  if (!rawJid) return { jid: null, resolved: false };

  // Already a phone jid — perfect
  if (isPhoneJid(rawJid)) return { jid: rawJid, resolved: true };

  // LID — try contextInfo sibling fields first
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const pn = ctx?.participantPn || ctx?.participantAlt || null;
  if (isPhoneJid(pn)) return { jid: pn, resolved: true };

  // Group metadata lookup: match participant by LID, read their phone number
  try {
    const groupJid = msg.key.remoteJid;
    if (groupJid && groupJid.endsWith('@g.us')) {
      const meta = await sock.groupMetadata(groupJid);
      const p = (meta.participants || []).find(x => x.id === rawJid);
      if (p) {
        const candidates = [
          p.phoneNumber,
          p.pn,
          p.participantPn,
          p.jidRecord?.pn,
          p.alt,
          (typeof p.phoneNumber === 'string' && !p.phoneNumber.includes('@')) ? p.phoneNumber + '@s.whatsapp.net' : null,
          (typeof p.pn === 'string' && !p.pn.includes('@')) ? p.pn + '@s.whatsapp.net' : null,
        ].filter(Boolean);
        for (const c of candidates) {
          if (isPhoneJid(c)) return { jid: c, resolved: true };
          if (/^\d{8,15}$/.test(c)) return { jid: c + '@s.whatsapp.net', resolved: true };
        }
        // participant id itself may be the PN in some groups
        if (isPhoneJid(p.id)) return { jid: p.id, resolved: true };
      }
    }
  } catch { /* metadata failed */ }

  // Last resort — keep original (LID delivery works inside LID groups)
  return { jid: rawJid, resolved: false };
}

/**
 * Extract a clean phone jid from user-typed input: ".capsule to 2547..." / "+254..."
 */
function phoneJidFromInput(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits + '@s.whatsapp.net';
}

/**
 * Display helper — never print digits. Returns a label for the target,
 * relying on WhatsApp mentions to render the real name.
 */
function displayLabel(targetJid, ownerNumber) {
  if (!targetJid) return 'a friend';
  if (ownerNumber && targetJid.startsWith(ownerNumber)) return 'yourself';
  return 'them'; // mention array does the naming
}

module.exports = { isPhoneJid, isLidJid, resolvePhoneJid, phoneJidFromInput, displayLabel };
