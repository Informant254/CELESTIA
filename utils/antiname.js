/**
 * utils/antiname.js — 🚫 ANTI-NAME: remove members whose WhatsApp display
 * name matches a banned identity. Default target: "Queen Sofia".
 *
 * Per-group flag via `.antiqueensofia on`. Matches the live pushName on every
 * group message (WhatsApp gives new joiners no name on the join event), and
 * also checks participant name fields when the join payload carries them.
 * Requires the bot to be group admin to remove; otherwise the owner is alerted.
 */
const groupSettingsStore = require('./groupSettingsStore');
const { isBotAdmin, isSenderAdmin, participantMatches, normalize } = require('./isAdmin');
const logger = require('./logger');

const DEFAULT_TARGETS = ['queen sofia'];
const KICK_COOLDOWN_MS = 2 * 60 * 1000;
const kicked = new Map(); // `${group}:${jid}` -> epoch ms

function isOn(groupJid) {
  try {
    return groupSettingsStore.get(groupJid, 'antiname', false) === true;
  } catch {
    return false;
  }
}

function targetsFor(groupJid) {
  try {
    const stored = groupSettingsStore.get(groupJid, 'antiname_targets', null);
    if (Array.isArray(stored) && stored.length) return stored;
    if (typeof stored === 'string' && stored.trim()) {
      return stored.split(',').map((s) => s.trim()).filter(Boolean);
    }
  } catch {}
  return DEFAULT_TARGETS;
}

function fold(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesTarget(name, targets) {
  const haystack = ` ${fold(name)} `;
  if (haystack.trim() === '') return false;
  return (targets || DEFAULT_TARGETS).some((t) => {
    const needle = ` ${fold(t)} `;
    return needle.trim() !== '' && haystack.includes(needle);
  });
}

function displayNamesOf(msg) {
  return [msg?.pushName, msg?.verifiedBizName].filter(Boolean);
}

function ownerNumberDigits() {
  try {
    return String(require('../config/config').ownerNumber || '').replace(/\D/g, '');
  } catch {
    return '';
  }
}

function isOwnerJid(jid) {
  const digits = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  return !!digits && digits === ownerNumberDigits();
}

function cooldownKey(groupJid, jid) {
  return `${groupJid}:${normalize(jid)}`;
}

function recentlyKicked(groupJid, jid) {
  const key = cooldownKey(groupJid, jid);
  const at = kicked.get(key);
  if (!at) return false;
  if (Date.now() - at > KICK_COOLDOWN_MS) {
    kicked.delete(key);
    return false;
  }
  return true;
}

function markKicked(groupJid, jid) {
  kicked.set(cooldownKey(groupJid, jid), Date.now());
  if (kicked.size > 300) kicked.delete(kicked.keys().next().value);
}

async function alertOwner(sock, text) {
  try {
    const owner = require('../config/config').ownerNumber;
    if (!owner) return;
    await sock.sendMessage(`${owner}@s.whatsapp.net`, { text });
  } catch (e) {
    logger.warn(`[antiname] owner alert failed: ${e.message}`);
  }
}

// Remove one member. Demotes first when the target is an admin, since some
// clients refuse to remove a still-privileged participant.
async function removeMember(sock, groupJid, participantJid, named) {
  const metadata = await sock.groupMetadata(groupJid);
  const metadataName = metadata?.subject || groupJid;
  if (!isBotAdmin(sock, metadata)) {
    await alertOwner(sock, `🚫 *Anti-Name:* "${named}" is in *${metadataName}* but I need admin rights to remove them.`);
    return false;
  }
  const ids = new Set([normalize(participantJid)]);
  const target = (metadata.participants || []).find((p) => participantMatches(p, ids));
  try {
    if (target?.admin === 'admin' || target?.admin === 'superadmin') {
      await sock.groupParticipantsUpdate(groupJid, [participantJid], 'demote').catch(() => {});
    }
    await sock.groupParticipantsUpdate(groupJid, [participantJid], 'remove');
  } catch (e) {
    await alertOwner(sock, `🚫 *Anti-Name:* could not remove "${named}" from *${metadataName}*: ${String(e.message || e).slice(0, 100)}`);
    return false;
  }
  markKicked(groupJid, participantJid);
  logger.info(`[antiname] removed ${participantJid} from ${groupJid} (name="${named}")`);
  try {
    await sock.sendMessage(groupJid, {
      text: `🚫 *Anti-Name:* removed @${String(participantJid).split('@')[0]} — banned identity.`,
      mentions: [participantJid],
    });
  } catch {}
  return true;
}

// Message path: WhatsApp only reveals a member's display name on messages,
// so every group message checks the live pushName.
async function checkMessage(sock, msg) {
  try {
    const groupJid = msg?.key?.remoteJid;
    if (!groupJid || !String(groupJid).endsWith('@g.us')) return false;
    if (!isOn(groupJid)) return false;
    const participant = msg.key?.participant || msg.key?.participantAlt || msg.key?.remoteJidAlt;
    if (!participant) return false;
    if (isOwnerJid(participant)) return false;

    const targets = targetsFor(groupJid);
    const names = displayNamesOf(msg);
    const hit = names.find((n) => matchesTarget(n, targets));
    if (!hit) return false;
    if (recentlyKicked(groupJid, participant)) return true;

    const metadata = await sock.groupMetadata(groupJid).catch(() => null);
    if (metadata && isSenderAdmin(metadata, participant)) return false;

    return await removeMember(sock, groupJid, participant, hit);
  } catch (e) {
    logger.error(`[antiname] check failed: ${e.message}`);
    return false;
  }
}

// Join path: some envelopes include a name field — use it when present so the
// removal lands at join time instead of waiting for her first message.
async function handleEvent(sock, event) {
  try {
    if (!event?.id || !String(event.id).endsWith('@g.us')) return;
    if (event.action !== 'add') return;
    if (!isOn(event.id)) return;
    const targets = targetsFor(event.id);
    for (const participant of event.participants || []) {
      const candidates = typeof participant === 'string'
        ? [participant]
        : [participant?.id, participant?.jid, participant?.phoneNumber, participant?.lid, participant?.pn].filter(Boolean);
      for (const jid of candidates) {
        if (String(jid).endsWith('@g.us')) continue;
        if (await tryRemove(sock, event.id, jid, participant, targets)) return;
      }
    }
  } catch (e) {
    logger.error(`[antiname] event failed: ${e.message}`);
  }
}

async function tryRemove(sock, groupJid, jid, participant, targets) {
  if (!jid || isOwnerJid(jid)) return false;
  if (recentlyKicked(groupJid, jid)) return true;
  const names = [participant?.name, participant?.notify, participant?.verifiedName].filter(Boolean);
  const hit = names.find((n) => matchesTarget(n, targets));
  if (!hit) return false;
  return await removeMember(sock, groupJid, jid, hit);
}

module.exports = {
  handleEvent,
  checkMessage,
  isOn,
  targetsFor,
  matchesTarget,
  DEFAULT_TARGETS,
};
