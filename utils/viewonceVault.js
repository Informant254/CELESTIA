/**
 * 🔓 VIEWONCE INBOX — beyond normal anti-view-once 🔓
 *
 * Not a command you hunt for. A reflex:
 *   - You REPLY to any view-once message (with anything — even just an emoji)
 *     → she instantly downloads it and DMs you the OPEN media.
 *   - Every view-once that lands is also caught at receive-time and forwarded.
 *   - RAM-only delivery: nothing is written to disk, nothing is archived.
 *   - .vv auto on/off → master switch (default ON)
 *
 * Works on: viewOnceMessage, viewOnceMessageV2, V2Extension,
 * ephemeral-wrapped view-once, audio view-once.
 */

const settingsStore = require('./settingsStore');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

let downloaderOverride = null;
// Test hook: swap the media downloader (production always uses Baileys).
function setDownloader(fn) { downloaderOverride = fn || null; }
function dlMedia(...a) {
  const fn = downloaderOverride || require('@whiskeysockets/baileys').downloadMediaMessage;
  return fn(...a);
}

// RAM-only cache of ORIGINAL view-once payloads (full mediaKey/url/directPath).
// Newer WhatsApp versions deliver quoted view-once references stripped of
// url/directPath AND mediaKey, so reply-time flows must fall back to the
// original captured the moment it arrived.
const ORIGINAL_TTL_MS = 24 * 60 * 60 * 1000;
const ORIGINAL_MAX = 100;
const originalCache = new Map();

function rememberOriginal(id, message) {
  if (!id || !message) return;
  if (originalCache.size >= ORIGINAL_MAX) {
    const oldest = originalCache.keys().next().value;
    originalCache.delete(oldest);
  }
  originalCache.set(id, { message, ts: Date.now() });
}

function recallOriginal(id) {
  const hit = originalCache.get(id);
  if (!hit) return null;
  if (Date.now() - hit.ts > ORIGINAL_TTL_MS) {
    originalCache.delete(id);
    return null;
  }
  return hit.message;
}

const MEDIA_FRESH_FIELDS = ['url', 'directPath', 'mediaKey', 'fileEncSha256', 'fileSha256', 'mediaKeyTimestamp', 'fileLength'];

function graftFreshMedia(target, source) {
  let grafted = 0;
  for (const field of MEDIA_FRESH_FIELDS) {
    if (source[field] != null) { target[field] = source[field]; grafted++; }
  }
  return grafted;
}

const VAULT_DIR = path.join(__dirname, '../vault');

const VAULT_KEY = 'vv_vault';
const AUTO_KEY = 'vv_auto'; // default ON
const MAX_VAULT = 50;
const MAX_MEDIA_BYTES = 64 * 1024 * 1024;
const MAX_CAPTURE_CONCURRENCY = 2;
const MAX_CAPTURE_QUEUE = 20;
let activeCaptures = 0;
const captureQueue = [];

function mediaLength(value) {
  if (value == null) return null;
  try {
    const n = typeof value === 'bigint'
      ? Number(value)
      : (typeof value.toNumber === 'function' ? value.toNumber() : Number(value));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

function acquireCaptureSlot() {
  function release() {
    const next = captureQueue.shift();
    if (next) next();
    else activeCaptures--;
  }
  if (activeCaptures < MAX_CAPTURE_CONCURRENCY) {
    activeCaptures++;
    return Promise.resolve(release);
  }
  if (captureQueue.length >= MAX_CAPTURE_QUEUE) return Promise.resolve(null);
  return new Promise((resolve) => captureQueue.push(() => resolve(release)));
}

// ─────────────────────────────────────────
// UNWRAP — every view-once nesting WhatsApp invented
// ─────────────────────────────────────────

function unwrapViewOnce(message) {
  if (!message) return null;
  let m = message;
  // Wrappers can nest (deviceSent → ephemeral → viewOnceV2…), so unwrap in
  // a loop instead of a single pass.
  for (let i = 0; i < 5; i++) {
    // Messages sent from the owner's own phone arrive deviceSent-wrapped.
    if (m.deviceSentMessage?.message) { m = m.deviceSentMessage.message; continue; }
    if (m.ephemeralMessage?.message) { m = m.ephemeralMessage.message; continue; }
    if (m.documentWithCaptionMessage?.message) { m = m.documentWithCaptionMessage.message; continue; }
    if (m.documentWithCaption?.message) { m = m.documentWithCaption.message; continue; }
    if (m.viewOnceMessage?.message) return m.viewOnceMessage.message;
    if (m.viewOnceMessageV2?.message) return m.viewOnceMessageV2.message;
    if (m.viewOnceMessageV2Extension?.message) return m.viewOnceMessageV2Extension.message;
    return null;
  }
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
// Handles BOTH shapes: wrapped (viewOnceMessageV2…) AND direct-flag
// (imageMessage.viewOnce — the form real quotes arrive in).
function findViewOnce(message) {
  const unwrapped = unwrapViewOnce(message);
  if (unwrapped) return classifyMedia(unwrapped);
  if (message?.imageMessage?.viewOnce) return { type: 'image', message: message.imageMessage, wa: 'image' };
  if (message?.videoMessage?.viewOnce) return { type: 'video', message: message.videoMessage, wa: 'video' };
  if (message?.audioMessage?.viewOnce) return { type: 'audio', message: message.audioMessage, wa: 'audio' };
  return null;
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
// DELIVERY — inbox-only. Downloads stay in RAM, ride one DM, vanish.
// Nothing is written to disk, nothing is archived. Ever.
// ─────────────────────────────────────────

async function deliverToOwner(sock, ownerJid, buffer, type, caption) {
  const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
  const payload = { [keyMap[type] || 'image']: buffer };
  if (caption) payload.caption = caption;
  if (type === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
  if (type === 'video') payload.mimetype = 'video/mp4';
  await sock.sendMessage(ownerJid, payload);
  return true;
}

const RIP_LINES = [
  '👁️‍🗨️ *Snatched before it vanished.*',
  '💫 *View-once? Never heard of her.*',
  '🏴‍☠️ *Plundered from the disappearing realm.*',
  '⚡ *Caught mid-vanish.*',
  '🌙 *The stars keep what WhatsApp deletes.*',
  '🔓 *Unlocked from the once-only vault.*',
];

function inboxCaption(origCaption) {
  const line = RIP_LINES[Math.floor(Math.random() * RIP_LINES.length)];
  let c = `${line}\n🔓 _Retrieved by CELESTIA_ ✨`;
  if (origCaption) c += `\n\n_"${String(origCaption).slice(0, 120)}"_`;
  return { text: c, mentions: [] };
}

// ─────────────────────────────────────────
// CAPTURE — receive-time (original message, full keys) — THE RELIABLE PATH
// ─────────────────────────────────────────

async function captureOriginal(sock, msg, ownerJid) {
  let release;
  try {
    // only messages addressed to the owner's chats (DMs to owner, or groups owner is in)
    const found = findViewOnce(msg.message);
    if (!found) return null;
    const expectedSize = mediaLength(found.message?.fileLength);
    if (expectedSize != null && expectedSize > MAX_MEDIA_BYTES) {
      logger.error(`[vault] skipped oversized media (${expectedSize} bytes)`);
      return null;
    }

    release = await acquireCaptureSlot();
    if (!release) {
      logger.error('[vault] capture queue full');
      return null;
    }

    const senderJid = msg.key.participantPn || msg.key.participant || msg.key.remoteJidAlt || msg.key.remoteJid;

    // download the ORIGINAL — has full mediaKey/directPath — straight to RAM.
    // reuploadRequest retries media already consumed server-side (owner
    // replies hours later), same as the .vv command path.
    await ensureMediaUrl(sock, msg.key, msg.message);
    const buffer = await dlMedia(msg, 'buffer', {}, { logger: { level: 'silent' }, reuploadRequest: sock.updateMediaMessage });
    if (!buffer || !buffer.length || buffer.length > MAX_MEDIA_BYTES) {
      if (buffer?.length > MAX_MEDIA_BYTES) logger.error(`[vault] skipped oversized download (${buffer.length} bytes)`);
      return null;
    }

    const { text, mentions } = inboxCaption(found.message?.caption);
    const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
    const payload = { [keyMap[found.type]]: buffer, caption: text, mentions };
    if (found.type === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
    if (found.type === 'video') payload.mimetype = 'video/mp4';
    await sock.sendMessage(ownerJid, payload);
    logger.info('[vault] receive-time inbox delivery');
    return { delivered: true };
  } catch (e) {
    logger.error(`[vault] receive capture failed: ${e.message}`);
    return null;
  } finally {
    if (release) release();
  }
}

// ─────────────────────────────────────────
// CAPTURE — reply-quoted (fallback, works when media still fresh)
// ─────────────────────────────────────────

async function captureToVault(sock, rawQuotedMessage, contextKeyInfo, senderJid, ownerJid) {
  let release;
  try {
    const found = findViewOnce(rawQuotedMessage);
    if (!found) return null;
    const expectedSize = mediaLength(found.message?.fileLength);
    if (expectedSize != null && expectedSize > MAX_MEDIA_BYTES) {
      logger.error(`[vault] skipped oversized media (${expectedSize} bytes)`);
      return null;
    }

    release = await acquireCaptureSlot();
    if (!release) {
      logger.error('[vault] capture queue full');
      return null;
    }

    // Reconstruct a downloadable message object
    const fakeMsg = {
      key: contextKeyInfo || { remoteJid: senderJid, id: 'vault' + Date.now() },
      message: rawQuotedMessage,
    };
    await ensureMediaUrl(sock, fakeMsg.key, rawQuotedMessage);
    const buffer = await dlMedia(fakeMsg, 'buffer', {}, { logger: { level: 'silent' }, reuploadRequest: sock.updateMediaMessage });
    if (!buffer || !buffer.length || buffer.length > MAX_MEDIA_BYTES) {
      if (buffer?.length > MAX_MEDIA_BYTES) logger.error(`[vault] skipped oversized download (${buffer.length} bytes)`);
      return null;
    }

    const { text, mentions } = inboxCaption(found.message?.caption);
    const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
    const payload = { [keyMap[found.type]]: buffer, caption: text, mentions };
    if (found.type === 'audio') payload.mimetype = 'audio/ogg; codecs=opus';
    if (found.type === 'video') payload.mimetype = 'video/mp4';

    // DM open media to owner — no disk, no archive
    await sock.sendMessage(ownerJid, payload);
    return { delivered: true };
  } catch (e) {
    logger.error(`[vault] capture failed: ${e.message}`);
    return null;
  } finally {
    if (release) release();
  }
}

// ─────────────────────────────────────────
// MONITOR — the silent reply hook.
// Call on every incoming message: if the OWNER replied to a view-once with
// ANYTHING (text, emoji, sticker, image, audio, document), rip it to inbox.
// Returns true when it handled the message.
// ─────────────────────────────────────────

async function monitorReply(sock, msg, ownerJid) {
  try {
    const { isOwner } = require('./isOwner');
    if (!isOwner(msg)) return false;
    if (!isAutoOn()) {
      logger.info('[vault] monitor: skip — auto is OFF (.vv auto on to enable)');
      return false;
    }

    // Replies can ride on ANY message type — check every context carrier.
    const m = msg.message || {};
    const carriers = {
      text: m.extendedTextMessage?.contextInfo,
      image: m.imageMessage?.contextInfo,
      video: m.videoMessage?.contextInfo,
      sticker: m.stickerMessage?.contextInfo,
      audio: m.audioMessage?.contextInfo,
      document: m.documentMessage?.contextInfo,
    };
    const foundCarrier = Object.keys(carriers).find((k) => carriers[k]);
    const ctx = foundCarrier ? carriers[foundCarrier] : null;
    if (!ctx?.quotedMessage) return false; // not a reply — silent by design
    if (!findViewOnce(ctx.quotedMessage)) {
      logger.info(`[vault] monitor: quoted msg is not view-once (via ${foundCarrier})`);
      return false;
    }
    logger.info(`[vault] monitor: view-once reply detected via ${foundCarrier} — ripping...`);

    const senderJid = ctx.participantPn || ctx.participant || ctx.participantAlt || msg.key.remoteJidAlt || msg.key.remoteJid;
    const r = await captureToVault(
      sock, ctx.quotedMessage,
      { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant },
      senderJid, ownerJid
    );
    if (r) logger.info('[vault] monitor: reply-rip delivered to inbox');
    return !!r;
  } catch (e) {
    logger.error(`[vault] monitor: ${e.message}`);
    return false;
  }
}

// View-once quotes frequently arrive stripped: no url, no directPath, and on
// newer WhatsApp versions not even mediaKey. Recovery stages:
//   1) graft the media fields from the ORIGINAL payload cached at arrival
//   2) ask the linked phone for recent history (companions often skip
//      view-once payloads in real-time sync, but the phone can re-share them)
//   3) if a mediaKey exists but a path is gone, ask the sender device to
//      re-upload (Baileys updateMediaMessage mutates the inner media object).
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureMediaUrl(sock, keyInfo, wrapperMessage) {
  const found = findViewOnce(wrapperMessage);
  if (!found?.message) return wrapperMessage;
  if (found.message.url || found.message.directPath) return wrapperMessage;

  const graftFromCache = () => {
    const cached = recallOriginal(keyInfo?.id);
    if (!cached) return false;
    const orig = findViewOnce(cached);
    if (!orig?.message) return false;
    const grafted = graftFreshMedia(found.message, orig.message);
    return !!(grafted && (found.message.url || found.message.directPath));
  };

  if (graftFromCache()) {
    logger.info('[vault] recovered stripped view-once quote from arrival cache');
    return wrapperMessage;
  }

  // On-demand history sync: the phone holds the original payload with keys.
  if (typeof sock?.fetchMessageHistory === 'function' && keyInfo?.id) {
    try {
      const ts = Math.floor(Date.now() / 1000);
      logger.info(`[vault] stripped view-once ${keyInfo.id} — requesting history from phone`);
      await sock.fetchMessageHistory(100, keyInfo, ts);
      for (let i = 0; i < 8; i++) {
        await sleep(500);
        if (graftFromCache()) {
          logger.info('[vault] recovered view-once from on-demand history sync');
          return wrapperMessage;
        }
      }
    } catch (e) {
      logger.warn(`[vault] history fetch failed: ${e.message}`);
    }
  }

  if (!found.message.mediaKey) {
    logger.warn(`[vault] view-once lacks url, directPath AND mediaKey — nothing to download (id=${keyInfo?.id})`);
    return wrapperMessage;
  }
  if (typeof sock?.updateMediaMessage !== 'function') return wrapperMessage;
  logger.info('[vault] view-once lacks directPath — requesting media reupload');
  try {
    await sock.updateMediaMessage({ key: keyInfo, message: wrapperMessage });
  } catch (e) {
    logger.warn(`[vault] media refresh failed: ${e.message}`);
  }
  return wrapperMessage;
}

async function sendVaultEntry(sock, toJid, entry, preloadedBuffer) {
  const buffer = preloadedBuffer ||
    fs.readFileSync(path.join(VAULT_DIR, entry.file));

  const meta = `🔐 *VIEWONCE VAULT*\n\nFrom: @${entry.sender}\nWhen: ${new Date(entry.ts).toLocaleString()}\nType: ${entry.type} • ${entry.sizeKb}KB`;
  const keyMap = { image: 'image', video: 'video', audio: 'audio', sticker: 'sticker' };
  const realPayload = { [keyMap[entry.type]]: buffer, caption: meta, mentions: [`${entry.sender}@s.whatsapp.net`] };
  if (entry.type === 'audio') realPayload.mimetype = 'audio/ogg; codecs=opus';
  if (entry.type === 'video') realPayload.mimetype = 'video/mp4';

  await sock.sendMessage(toJid, realPayload);
  return { delivered: true };
}

module.exports = {
  unwrapViewOnce, findViewOnce, classifyMedia, ensureMediaUrl,
  rememberOriginal, recallOriginal,
  captureToVault, captureOriginal, sendVaultEntry, monitorReply, setDownloader,
  getVault, getFromVault, clearVault, saveToVault,
  isAutoOn, setAuto,
  VAULT_DIR,
};
