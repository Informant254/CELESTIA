/**
 * 🔐 VIEWONCE VAULT — beyond normal anti-view-once 🔐
 *
 * Not a command you hunt for. A reflex:
 *   - You REPLY to any view-once message (with anything — even just ".vv" or "wow")
 *     → she instantly captures it and DMs you the OPEN media.
 *   - Every capture is vaulted (persisted) with sender + time metadata.
 *   - .vault            → browse everything she's caught
 *   - .vault 3          → re-send capture #3
 *   - .vault clear      → empty the vault
 *   - .vault auto off   → stop auto-capture
 *
 * Works on: viewOnceMessage, viewOnceMessageV2, V2Extension,
 * ephemeral-wrapped view-once, audio view-once.
 */

const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const settingsStore = require('./settingsStore');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

const VAULT_DIR = path.join(__dirname, '../vault');

const VAULT_KEY = 'vv_vault';
const AUTO_KEY = 'vv_auto'; // default ON
const MAX_VAULT = 50;

// ─────────────────────────────────────────
// UNWRAP — every view-once nesting WhatsApp invented
// ─────────────────────────────────────────

function unwrapViewOnce(message) {
  if (!message) return null;
  let m = message;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.documentWithCaption?.message) m = m.documentWithCaption.message;
  if (m.viewOnceMessage?.message) return m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) return m.viewOnceMessageV2.message;
  if (m.viewOnceMessageV2Extension?.message) return m.viewOnceMessageV2Extension.message;
  return null;
}

function classifyMedia(unwrapped) {
  if (unwrapped.imageMessage) return { type: 'image', message: unwrapped.imageMessage, wa: 'image' };
  if (unwrapped.videoMessage) return { type: 'video', message: unwrapped.videoMessage, wa: 'video' };
  if (unwrapped.audioMessage) return { type: 'audio', message: unwrapped.audioMessage, wa: 'audio' };
  if (unwrapped.stickerMessage) return { type: 'sticker', message: unwrapped.stickerMessage, wa: 'sticker' };
  return null;
}

// Does a message (or its quoted content) contain a view-once?
function findViewOnce(message) {
  const unwrapped = unwrapViewOnce(message);
  if (!unwrapped) return null;
  return classifyMedia(unwrapped);
}

// ─────────────────────────────────────────
// VAULT STORAGE
// ─────────────────────────────────────────

function getVault() {
  const v = settingsStore.get(VAULT_KEY, []);
  return Array.isArray(v) ? v : [];
}

function saveToVault(entry) {
  const v = getVault();
  v.push(entry);
  const trimmed = v.slice(-MAX_VAULT); // keep newest 50
  settingsStore.set(VAULT_KEY, trimmed);
  return trimmed.length;
}

function getFromVault(index1based) {
  const v = getVault();
  const i = index1based - 1;
  if (i < 0 || i >= v.length) return null;
  return v[i];
}

function clearVault() {
  const count = getVault().length;
  settingsStore.set(VAULT_KEY, []);
  return count;
}

function isAutoOn() {
  return settingsStore.get(AUTO_KEY, true);
}

function setAuto(on) {
  settingsStore.set(AUTO_KEY, !!on);
}

// ─────────────────────────────────────────
// CAPTURE — receive-time (original message, full keys) — THE RELIABLE PATH
// ─────────────────────────────────────────

async function captureOriginal(sock, msg, ownerJid) {
  try {
    // only messages addressed to the owner's chats (DMs to owner, or groups owner is in)
    const found = findViewOnce(msg.message);
    if (!found) return null;

    const senderJid = msg.key.participantPn || msg.key.participant || msg.key.remoteJidAlt || msg.key.remoteJid;
    const senderNum = String(senderJid).split('@')[0].split(':')[0];

    // download the ORIGINAL — has full mediaKey/directPath
    const buffer = await downloadMediaMessage(msg, 'buffer', {});

    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
    const ext = { image: 'jpg', video: 'mp4', audio: 'ogg', sticker: 'webp' }[found.type];
    const fileName = `vault_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(VAULT_DIR, fileName), buffer);

    const entry = {
      id: Date.now(),
      type: found.type,
      file: fileName,
      sender: senderNum.length >= 8 ? senderNum : 'unknown',
      ts: Date.now(),
      caption: found.message?.caption || null,
      sizeKb: Math.round(buffer.length / 1024),
      source: 'receive',
    };
    const count = saveToVault(entry);

    // DM open media to owner
    await sendVaultEntry(sock, ownerJid, entry, buffer);
    logger.info(`[vault] receive-time capture from ${entry.sender} (#${count})`);
    return { entry, count };
  } catch (e) {
    logger.error(`[vault] receive capture failed: ${e.message}`);
    return null;
  }
}

// ─────────────────────────────────────────
// CAPTURE — reply-quoted (fallback, works when media still fresh)
// ─────────────────────────────────────────

async function captureToVault(sock, rawQuotedMessage, contextKeyInfo, senderJid, ownerJid) {
  try {
    const found = findViewOnce(rawQuotedMessage);
    if (!found) return null;

    // Reconstruct a downloadable message object
    const fakeMsg = {
      key: contextKeyInfo || { remoteJid: senderJid, id: 'vault' + Date.now() },
      message: rawQuotedMessage,
    };
    const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});

    // persist to disk
    if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
    const ext = found.type === 'image' ? 'jpg' : found.type === 'video' ? 'mp4' : found.type === 'audio' ? 'ogg' : 'webp';
    const fileName = `vault_${Date.now()}.${ext}`;
    const filePath = path.join(VAULT_DIR, fileName);
    fs.writeFileSync(filePath, buffer);

    // vault metadata
    const entry = {
      id: Date.now(),
      type: found.type,
      file: fileName,
      sender: senderJid ? String(senderJid).split('@')[0] : 'unknown',
      ts: Date.now(),
      caption: found.message?.caption || null,
      sizeKb: Math.round(buffer.length / 1024),
    };
    const count = saveToVault(entry);

    // DM open media to owner
    await sendVaultEntry(sock, ownerJid, entry, buffer);
    return { entry, count };
  } catch (e) {
    logger.error(`[vault] capture failed: ${e.message}`);
    return null;
  }
}

async function sendVaultEntry(sock, toJid, entry, preloadedBuffer) {
  const buffer = preloadedBuffer ||
    fs.readFileSync(path.join(VAULT_DIR, entry.file));

  const meta = `🔐 *VIEWONCE VAULT*\n\nFrom: @${entry.sender}\nWhen: ${new Date(entry.ts).toLocaleString()}\nType: ${entry.type} • ${entry.sizeKb}KB`;
  const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
  const realPayload = { [keyMap[entry.type]]: buffer, caption: meta, mentions: [`${entry.sender}@s.whatsapp.net`] };
  if (entry.type === 'audio') realPayload.mimetype = 'audio/ogg; codecs=opus';
  if (entry.type === 'video') realPayload.mimetype = 'video/mp4';

  await sock.sendMessage(toJid, realPayload).catch(() => {});
}

module.exports = {
  unwrapViewOnce, findViewOnce, classifyMedia,
  captureToVault, captureOriginal, sendVaultEntry,
  getVault, getFromVault, clearVault, saveToVault,
  isAutoOn, setAuto,
  VAULT_DIR,
};
