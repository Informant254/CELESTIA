/**
 * 👻 GHOST SAVER — the status archive that outlives 24 hours 👻
 *
 * She quietly downloads every contact's status the moment it arrives:
 *   - before the 24h expiry — media saved to disk forever
 *   - deleted statuses survive too — she grabs them at delivery,
 *     deletion can't unsend what's already archived
 *   - text statuses archived as text
 *   - browse anytime: .ghostarchive
 *
 * Optional secrecy: .ghostarchive ghost off → she STOPS marking statuses
 * as viewed, so contacts don't even know you saw. (Media still saved.)
 */

const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settingsStore = require('./settingsStore');
const logger = require('./logger');

const ARCHIVE_KEY = 'ghost_archive';
const ENABLE_KEY = 'ghost_saver_on';     // default ON
const STEALTH_KEY = 'ghost_stealth';     // default OFF (view receipts still sent)
const MAX = 200;

const DIR = path.join(__dirname, '../vault/statuses');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
function getArchive() {
  const a = settingsStore.get(ARCHIVE_KEY, []);
  return Array.isArray(a) ? a : [];
}
function addEntry(e) {
  const a = getArchive();
  a.push(e);
  settingsStore.set(ARCHIVE_KEY, a.slice(-MAX));
  return Math.min(a.length, MAX);
}
function getEntry(i1) {
  const a = getArchive();
  const i = i1 - 1;
  return (i >= 0 && i < a.length) ? { entry: a[i], idx: i, total: a.length } : null;
}
function clearArchive() {
  const n = getArchive().length;
  settingsStore.set(ARCHIVE_KEY, []);
  return n;
}
function isOn() { return settingsStore.get(ENABLE_KEY, true); }
function setOn(v) { settingsStore.set(ENABLE_KEY, !!v); }
function isStealth() { return settingsStore.get(STEALTH_KEY, false); }
function setStealth(v) { settingsStore.set(STEALTH_KEY, !!v); }

// ─────────────────────────────────────────
// CLASSIFY + SAVE
// ─────────────────────────────────────────

function classifyStatus(message) {
  if (!message) return null;
  if (message.imageMessage) return { type: 'image', inner: message.imageMessage };
  if (message.videoMessage) return { type: 'video', inner: message.videoMessage };
  if (message.audioMessage) return { type: 'audio', inner: message.audioMessage };
  if (message.stickerMessage) return { type: 'sticker', inner: message.stickerMessage };
  const text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption;
  if (text) return { type: 'text', text };
  return null;
}

async function archiveStatus(sock, msg) {
  try {
    const poster = msg.key.participantPn || msg.key.participant || msg.key.participantAlt;
    if (!poster) return null;
    const posterNum = String(poster).split('@')[0].split(':')[0];
    if (posterNum.length < 8) return null; // not a real contact

    // don't archive our own posts
    const { jidNormalizedUser } = require('@whiskeysockets/baileys');
    const selfNum = String(sock.user?.id || '').split('@')[0].split(':')[0];
    if (posterNum === selfNum) return null;

    const found = classifyStatus(msg.message);
    if (!found) return null;

    const ts = Date.now();
    let entry = {
      id: ts,
      poster: posterNum,
      ts,
      type: found.type,
      deleted: false,
      caption: found.inner?.caption || null,
    };

    // keep the message key so .statusreact can react later
    globalThis.__latestStatusKey = msg.key;
    try {
      const store = require('./settingsStore');
      const keysMap = store.get('status_react_keys', {});
      keysMap[ts] = { key: msg.key };
      // trim map to last 50
      const k = Object.keys(keysMap).sort((a, b) => b - a).slice(0, 50);
      const trimmed = {};
      k.forEach(id => trimmed[id] = keysMap[id]);
      store.set('status_react_keys', trimmed);
    } catch { /* non-fatal */ }

    if (found.type === 'text') {
      entry.text = found.text.slice(0, 800);
    } else {
      // download media BEFORE it can expire/be deleted
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      const ext = { image: 'jpg', video: 'mp4', audio: 'ogg', sticker: 'webp' }[found.type];
      const fname = `st_${ts}.${ext}`;
      fs.writeFileSync(path.join(DIR, fname), buffer);
      entry.file = fname;
      entry.sizeKb = Math.round(buffer.length / 1024);
    }

    const count = addEntry(entry);
    logger.info(`[ghost] archived ${found.type} status from ${posterNum} (#${count})`);
    return { entry, count };
  } catch (e) {
    logger.error(`[ghost] archive failed: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────
// DELETE DETECTION — when someone deletes a status,
// the archive already has it; we just flip the flag
// ─────────────────────────────────────────

function markDeletedIfExists(posterNum, aroundTs) {
  const a = getArchive();
  // statuses delete-notify with the poster's jid; find recent entries from them
  let marked = 0;
  for (const e of a) {
    if (e.poster === posterNum && !e.deleted && (aroundTs ? Math.abs(e.ts - aroundTs) < 12 * 3600000 : true)) {
      e.deleted = true;
      marked++;
    }
  }
  if (marked) settingsStore.set(ARCHIVE_KEY, a);
  return marked;
}

async function sendArchived(sock, toJid, entry) {
  const meta =
    `👻 *GHOST ARCHIVE*\n` +
    `From: @${entry.poster}\n` +
    `When: ${new Date(entry.ts).toLocaleString()}` +
    (entry.deleted ? `\n⚠️ _deleted by poster — survived here_` : '') +
    (entry.type !== 'text' ? `\n${entry.type} • ${entry.sizeKb}KB` : '');
  const mentions = [`${entry.poster}@s.whatsapp.net`];

  if (entry.type === 'text') {
    await sock.sendMessage(toJid, { text: meta + '\n\n' + (entry.text || ''), mentions });
    return;
  }
  const buffer = fs.readFileSync(path.join(DIR, entry.file));
  const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
  const payload = { [keyMap[entry.type]]: buffer, caption: meta, mentions };
  if (entry.type === 'video') payload.mimetype = 'video/mp4';
  if (entry.type === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
  await sock.sendMessage(toJid, payload);
}

module.exports = {
  archiveStatus, markDeletedIfExists, sendArchived,
  getArchive, getEntry, clearArchive,
  isOn, setOn, isStealth, setStealth,
  classifyStatus, DIR,
};
