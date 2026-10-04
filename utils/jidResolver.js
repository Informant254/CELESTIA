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

function digits(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function contextInfo(msg) {
  let content = msg?.message || {};
  try {
    content = require('@whiskeysockets/baileys').normalizeMessageContent(content) || content;
  } catch {}
  for (const value of Object.values(content)) {
    if (value?.contextInfo) return value.contextInfo;
  }
  return null;
}

function asPhoneJid(value) {
  if (isPhoneJid(value)) return value;
  const valueDigits = digits(value);
  return valueDigits.length >= 8 && valueDigits.length <= 15
    ? `${valueDigits}@s.whatsapp.net`
    : null;
}

function participantPhoneJid(participant, learned = {}) {
  const candidates = [
    participant?.phoneNumber,
    participant?.pn,
    participant?.participantPn,
    participant?.jidRecord?.pn,
    participant?.alt,
    isPhoneJid(participant?.id) ? participant.id : null,
  ];
  for (const candidate of candidates) {
    const jid = asPhoneJid(candidate);
    if (jid) return jid;
  }
  for (const lid of [participant?.id, participant?.lid]) {
    const mapped = learned[digits(lid)];
    const jid = asPhoneJid(mapped);
    if (jid) return jid;
  }
  return null;
}

function resolveGroupTargets(metadata, msg, args = [], { allowNonMember = false } = {}) {
  const ctx = contextInfo(msg) || {};
  const candidates = [];
  // Explicit targets win over the message being replied to. This prevents
  // `.promote @Bob` on a reply to Alice from mutating Alice by accident.
  if (Array.isArray(ctx.mentionedJid)) candidates.push(...ctx.mentionedJid);
  for (const arg of args) {
    const jid = asPhoneJid(arg);
    if (jid) candidates.push(jid);
  }
  if (ctx.participant) candidates.push(ctx.participant);

  const { participantMatches, normalize } = require('./isAdmin');
  const out = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const candidateJid = isLidJid(candidate) || isPhoneJid(candidate) ? candidate : asPhoneJid(candidate);
    if (!candidateJid) continue;
    const identifiers = new Set([normalize(candidateJid)]);
    const participant = (metadata?.participants || []).find((entry) => participantMatches(entry, identifiers));
    if (participant) {
      const jid = participant.id || participant.lid || participant.phoneNumber;
      const key = normalize(jid);
      if (!jid || seen.has(key)) continue;
      seen.add(key);
      out.push({ jid, participant, phoneJid: participantPhoneJid(participant) });
      continue;
    }
    if (allowNonMember) {
      const phoneJid = asPhoneJid(candidateJid);
      if (phoneJid && !seen.has(phoneJid)) {
        seen.add(phoneJid);
        out.push({ jid: phoneJid, participant: null, phoneJid });
      }
    }
  }
  return out;
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

module.exports = {
  isPhoneJid, isLidJid, digits, contextInfo, asPhoneJid,
  participantPhoneJid, resolveGroupTargets,
  resolvePhoneJid, phoneJidFromInput, displayLabel,
};
