/**
 * utils/antikill.js — 🛡️ ANTI-KILL: instant recovery from mass-removals.
 *
 * Event-driven (no polling): on hostile kicks the bot re-adds victims
 * immediately, and an attacker who keeps going gets demoted + removed.
 * Per-group flag via `.antikill on`. Requires the bot to be group admin
 * for counter-action; without admin rights it alerts the owner instead.
 */
const groupSettingsStore = require('./groupSettingsStore');
const { isBotAdmin, participantMatches, normalize } = require('./isAdmin');
const { isOwner } = require('./isOwner');

const STRIKE_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_STRIKE_LIMIT = 3;
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

const strikes = new Map(); // `${group}:${author}` -> { count, since }
const alerted = new Map(); // group -> epoch ms

function isOn(groupJid) {
  try {
    return groupSettingsStore.get(groupJid, 'antikill', false) === true;
  } catch {
    return false;
  }
}

function digits(v) {
  return String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function ownerDigits(msgLike) {
  try {
    const owner = require('../config/config').ownerNumber || '';
    return digits(owner);
  } catch {
    return '';
  }
}

function isOwnerJid(jid, ownerPn) {
  return !!jid && !!ownerPn && digits(jid) === ownerPn;
}

function fieldsOf(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  return [value.id, value.jid, value.lid, value.phoneNumber, value.pn].filter(Boolean);
}

// Expand one event identifier through group metadata. This bridges WhatsApp's
// PN/LID split, where the same account can be the victim as @s.whatsapp.net
// but the event author as @lid (or the reverse).
function identitySet(value, metadata) {
  const ids = new Set(fieldsOf(value).map(normalize).filter(Boolean));
  for (const participant of metadata?.participants || []) {
    if (!participantMatches(participant, ids)) continue;
    for (const field of fieldsOf(participant)) ids.add(normalize(field));
  }
  return ids;
}

function sameIdentity(left, right, metadata) {
  const leftIds = identitySet(left, metadata);
  const rightIds = identitySet(right, metadata);
  for (const id of leftIds) if (rightIds.has(id)) return true;
  return false;
}

function strike(group, author) {
  const k = `${group}:${author}`;
  const now = Date.now();
  const cur = strikes.get(k);
  if (!cur || now - cur.since > STRIKE_WINDOW_MS) {
    strikes.set(k, { count: 1, since: now });
    return 1;
  }
  cur.count += 1;
  return cur.count;
}

function alertCooling(group) {
  const last = alerted.get(group) || 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return true;
  alerted.set(group, Date.now());
  return false;
}

async function alertOwner(sock, text) {
  try {
    const ownerPn = digits(require('../config/config').ownerNumber || '');
    if (!ownerPn) return;
    await sock.sendMessage(`${ownerPn}@s.whatsapp.net`, { text });
  } catch { /* alert best-effort */ }
}

// event: { id (group jid), participants: [removedJids], action, author }
async function handleEvent(sock, event) {
  if (!event || event.action !== 'remove') return false;
  const group = event.id;
  if (!group || !isOn(group)) return false;
  const removed = (event.participants || []).filter((p) => fieldsOf(p).length);
  const removedJids = removed.map((p) => fieldsOf(p)[0]);
  if (!removedJids.length) return false;
  const author = event.author;
  const authorJid = fieldsOf(author)[0] || null;

  let metadata;
  try {
    metadata = await sock.groupMetadata(group);
  } catch {
    return false;
  }
  const ownerPn = ownerDigits();
  const botIsAdmin = isBotAdmin(sock, metadata);

  // The bot itself got kicked — can't act from outside; scream for help.
  const botIds = (() => { try { return require('./isAdmin').getBotIdentifiers(sock); } catch { return new Set(); } })();
  const botKicked = removedJids.some((r) => participantMatches({ id: r }, botIds));
  if (botKicked && !alertCooling(group)) {
    await alertOwner(sock, `🚨 *ANTIKILL:* I was removed from *${metadata.subject || group}* by ${authorJid || 'unknown'}.\n_Re-add me so I can restore the group._`);
  }

  if (!botIsAdmin) {
    if (!alertCooling(group) && removedJids.length >= 2) {
      await alertOwner(sock, `🚨 *ANTIKILL (${metadata.subject || group}):* ${removedJids.length} member(s) removed by ${authorJid || 'unknown'} — I'm not admin, can't restore.`);
    }
    return true;
  }

  const authorIsOwner = authorJid && ([...identitySet(author, metadata)].some((id) => digits(id) === ownerPn) || (() => {
    try { return isOwner({ key: { participant: authorJid, remoteJid: group } }); } catch { return false; }
  })());
  const authorIsBot = author && participantMatches(typeof author === 'string' ? { id: author } : author, botIds);

  let restored = 0;
  const restoredNames = [];
  for (let i = 0; i < removedJids.length; i++) {
    const victim = removedJids[i];
    const victimEvent = removed[i];
    if (participantMatches({ id: victim }, botIds)) continue; // self: alerted above
    if (isOwnerJid(victim, ownerPn)) {
      // Owner kicked — emergency restore + maximum response.
      try {
        await sock.groupParticipantsUpdate(group, [victim], 'add');
        restored++;
        restoredNames.push(victim.split('@')[0]);
      } catch { /* keep going */ }
      continue;
    }
    if (!authorJid || sameIdentity(author, victimEvent, metadata)) continue; // voluntary leave — respect it
    if (authorIsOwner || authorIsBot) continue; // authorized removal
    try {
      await sock.groupParticipantsUpdate(group, [victim], 'add');
      restored++;
      restoredNames.push(victim.split('@')[0]);
    } catch { /* keep going */ }
  }

  // Strike the attacker; persistent attackers get demoted + removed.
  // Limit is per-group (`.antikill warns <n>`), default 3.
  if (authorJid && !authorIsOwner && !authorIsBot) {
    const n = strike(group, authorJid);
    let limit = DEFAULT_STRIKE_LIMIT;
    try {
      const g = require('./groupSettingsStore').get(group, 'antikill_limit', DEFAULT_STRIKE_LIMIT);
      if (Number(g) >= 1 && Number(g) <= 10) limit = Number(g);
    } catch { /* default */ }
    if (n >= limit) {
      try {
        await sock.groupParticipantsUpdate(group, [authorJid], 'demote');
      } catch { /* may fail on creator/superadmin */ }
      try {
        await sock.groupParticipantsUpdate(group, [authorJid], 'remove');
        await sock.sendMessage(group, { text: `🛡️ *ANTIKILL:* @${digits(authorJid)} removed for mass-kicking after ${n} strikes.`, mentions: [authorJid] });
      } catch { /* best effort */ }
      if (!alertCooling(group)) {
        await alertOwner(sock, `🛡️ *ANTIKILL (${metadata.subject || group}):* neutralized @${digits(authorJid)} after ${n} hostile kicks. Restored ${restored}.`);
      }
    } else if (restored > 0) {
      try {
        await sock.sendMessage(group, {
          text: `🛡️ *AntiKill restored ${restored} member(s).* Mass-removals trigger here.`,
          mentions: restoredNames.map((d) => `${d}@s.whatsapp.net`),
        });
      } catch { /* cosmetic */ }
    }
  } else if (restored > 0) {
    try {
      await sock.sendMessage(group, { text: `🛡️ *AntiKill restored ${restored} member(s).*` });
    } catch { /* cosmetic */ }
  }
  return true;
}

function _strikeCount(group, author) {
  return (strikes.get(`${group}:${author}`) || {}).count || 0;
}

module.exports = { isOn, handleEvent, strike, _strikeCount };
