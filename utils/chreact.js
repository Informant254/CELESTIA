/**
 * utils/chreact.js — ⚡ CHANNEL REACTOR, exclusive to the operator's bot.
 *
 * Auto-reacts to new posts in followed WhatsApp Channels (newsletters)
 * with rotating emojis, after a human-ish delay.
 *
 * EXCLUSIVITY: every entry point requires the bot's configured owner to be
 * the operator (OPERATOR_PN). Client deployments carry a different
 * OWNER_NUMBER, so the files can ship everywhere and stay inert there.
 */
const settingsStore = require('./settingsStore');

// Operator's WhatsApp number (digits only, with country code).
const OPERATOR_PN = '254118266549';

const ON_KEY = 'chreact_on';
const CHANNELS_KEY = 'chreact_channels'; // [newsletterJid, ...] opted in
const EMOJIS_KEY = 'chreact_emojis';
const DEFAULT_EMOJIS = ['🔥', '❤️', '👏', '🎉', '😂', '💯'];

const reacted = new Map(); // serverId -> epoch ms (dedup redeliveries)
const MAX_SEEN = 2000;

function digits(v) {
  return String(v || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

// True only on the operator's own bot — client bots fail closed.
function isOperatorBot() {
  try {
    const owner = require('../config/config').ownerNumber || '';
    return digits(owner) === OPERATOR_PN;
  } catch {
    return false;
  }
}

function isOn() {
  return settingsStore.get(ON_KEY, false) === true;
}

function channels() {
  const v = settingsStore.get(CHANNELS_KEY, []);
  return Array.isArray(v) ? v : [];
}

function emojis() {
  const v = settingsStore.get(EMOJIS_KEY, DEFAULT_EMOJIS);
  return Array.isArray(v) && v.length ? v : DEFAULT_EMOJIS;
}

function isNewsletter(jid) {
  return String(jid || '').endsWith('@newsletter');
}

// Real post content only — never react to reactions, deletes, or protocol.
function isReactable(msg) {
  const m = msg.message || {};
  if (m.reactionMessage || m.protocolMessage) return false;
  return !!(
    m.conversation ||
    m.extendedTextMessage ||
    m.imageMessage ||
    m.videoMessage ||
    m.audioMessage ||
    m.documentMessage ||
    m.stickerMessage
  );
}

function serverIdOf(msg) {
  return msg.key?.server_id || msg.key?.id || null;
}

function pickEmoji() {
  const set = emojis();
  return set[Math.floor(Math.random() * set.length)];
}

// Fire-and-forget: human-ish delay, single react per post, never throws.
function maybeReact(sock, msg) {
  try {
    if (!isOperatorBot() || !isOn()) return false;
    if (!isNewsletter(msg.key?.remoteJid)) return false;
    if (!isReactable(msg)) return false;
    const jid = msg.key.remoteJid;
    if (!channels().includes(jid)) return false;
    const sid = serverIdOf(msg);
    if (!sid || reacted.has(sid)) return false;
    reacted.set(sid, Date.now());
    if (reacted.size > MAX_SEEN) reacted.delete(reacted.keys().next().value);
    const emoji = pickEmoji();
    const delay = 8000 + Math.random() * 22000; // 8–30s, looks human
    setTimeout(() => {
      try {
        const p = sock.newsletterReactMessage?.(jid, sid, emoji);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* silent */ }
    }, delay);
    return true;
  } catch {
    return false;
  }
}

function _seenCount() { return reacted.size; }

module.exports = {
  OPERATOR_PN, isOperatorBot, isOn, channels, emojis, isNewsletter,
  isReactable, serverIdOf, pickEmoji, maybeReact,
  ON_KEY, CHANNELS_KEY, EMOJIS_KEY, DEFAULT_EMOJIS, _seenCount,
};
