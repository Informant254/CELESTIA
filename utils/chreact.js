/**
 * utils/chreact.js — ⚡ CHANNEL REACTOR for every CELESTIA owner.
 *
 * Auto-reacts to new posts in followed WhatsApp Channels (newsletters)
 * with rotating emojis, after a human-ish delay. Any bot owner can use the
 * full feature set (follow/react/cycle/mirror) on their own channels.
 */
const settingsStore = require('./settingsStore');

// Operator's WhatsApp number (digits only, with country code).
const OPERATOR_PN = '254118266549';

const ON_KEY = 'chreact_on';
const CHANNELS_KEY = 'chreact_channels'; // [newsletterJid, ...] opted in
const EMOJIS_KEY = 'chreact_emojis';
const DEFAULT_EMOJIS = ['🔥', '❤️', '👏', '🎉', '😂', '💯'];
const CYCLE_KEY = 'chreact_cycle'; // null | { jid, serverId, emojis, everyMin, cyclesLeft, nextAt }
const LAST_POST_KEY = 'chreact_last_post'; // { jid, serverId } of newest seen post
const MIRROR_KEY = 'chreact_mirror'; // null | { jid, emoji } — fleet mode (any owner, consent-based)

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
    if (!isNewsletter(msg.key?.remoteJid)) return false;
    if (!isReactable(msg)) {
      console.log('[chreact] skip: not reactable content');
      return false;
    }
    const jid = msg.key.remoteJid;
    const sid = serverIdOf(msg);
    if (!sid || reacted.has(sid)) return false;

    // MIRROR (fleet): any owner's bot, fixed emoji, consent-gated by the
    // fact that only that bot's owner can set it. No operator check.
    const mirror = settingsStore.get(MIRROR_KEY, null);
    let emoji = null;
    if (mirror && mirror.jid === jid && mirror.emoji) {
      emoji = mirror.emoji;
    } else {
      // AUTO: reactor must be ON + channel opted in. Any owner.
      if (!isOn()) {
        console.log('[chreact] skip: reactor OFF');
        return false;
      }
      if (!channels().includes(jid)) {
        console.log(`[chreact] skip: ${jid} not in followed list`);
        return false;
      }
      emoji = pickEmoji();
    }

    reacted.set(sid, Date.now());
    if (reacted.size > MAX_SEEN) reacted.delete(reacted.keys().next().value);
    try {
      settingsStore.set(LAST_POST_KEY, { jid, serverId: sid });
      noteSock(sock);
    } catch { /* bookkeeping never blocks */ }
    const delay = 8000 + Math.random() * 22000; // 8–30s, looks human
    console.log(`[chreact] queued ${emoji} on ${jid} sid=${sid} in ${Math.round(delay / 1000)}s`);
    setTimeout(() => {
      try {
        const p = sock.newsletterReactMessage?.(jid, sid, emoji);
        if (p && typeof p.then === 'function') {
          p.then(
            () => console.log(`[chreact] reacted ${emoji} on ${jid}`),
            (e) => console.log(`[chreact] react FAILED: ${String(e.message || e).slice(0, 160)}`)
          );
        }
      } catch (e) {
        console.log(`[chreact] react FAILED: ${String(e.message || e).slice(0, 160)}`);
      }
    }, delay);
    return true;
  } catch {
    return false;
  }
}

function _seenCount() { return reacted.size; }

// ── CYCLE MODE: keep one post visibly alive ──
// WhatsApp keeps ONE reaction per account, so "50 reactions" from one bot
// is impossible — each new emoji replaces the last. Cycling rotates the
// emoji on your latest post every N minutes, re-pinging followers with
// activity for hours. Honest heat, not fake counts.
let ticker = null;
let liveSock = null;

function cycleState() {
  const v = settingsStore.get(CYCLE_KEY, null);
  return v && typeof v === 'object' ? v : null;
}

function lastPost() {
  const v = settingsStore.get(LAST_POST_KEY, null);
  return v && v.jid && v.serverId ? v : null;
}

function startCycle({ jid, serverId, emojis: list, everyMin, maxCycles }) {
  const clean = [...new Set((list || []).filter(Boolean))].slice(0, 12);
  if (!jid || !serverId || !clean.length) return null;
  const every = Math.min(120, Math.max(2, Number(everyMin) || 10));
  const total = Math.min(100, Math.max(1, Number(maxCycles) || 24));
  const state = { jid, serverId, emojis: clean, everyMin: every, cyclesLeft: total, nextAt: Date.now() + every * 60000, idx: 0 };
  settingsStore.set(CYCLE_KEY, state);
  ensureTicker();
  return state;
}

function stopCycle() {
  settingsStore.set(CYCLE_KEY, null);
  if (ticker) { clearInterval(ticker); ticker = null; }
}

async function tickCycle(sock) {
  const st = cycleState();
  if (!st) { if (ticker) { clearInterval(ticker); ticker = null; } return false; }
  if (Date.now() < st.nextAt || st.cyclesLeft <= 0) return false;
  const emoji = st.emojis[st.idx % st.emojis.length];
  try {
    await sock.newsletterReactMessage(st.jid, st.serverId, emoji);
  } catch {
    return false;
  }
  st.idx += 1;
  st.cyclesLeft -= 1;
  st.nextAt = Date.now() + st.everyMin * 60000;
  if (st.cyclesLeft <= 0) {
    settingsStore.set(CYCLE_KEY, null);
    if (ticker) { clearInterval(ticker); ticker = null; }
  } else {
    settingsStore.set(CYCLE_KEY, st);
  }
  return true;
}

function ensureTicker() {
  if (ticker || !cycleState()) return;
  ticker = setInterval(() => {
    if (liveSock) tickCycle(liveSock).catch(() => {});
  }, 30000);
  if (ticker.unref) ticker.unref();
}

function noteSock(sock) {
  liveSock = sock;
  ensureTicker();
}

module.exports = {
  OPERATOR_PN, isOperatorBot, isOn, channels, emojis, isNewsletter,
  isReactable, serverIdOf, pickEmoji, maybeReact, noteSock,
  cycleState, lastPost, startCycle, stopCycle, tickCycle, ensureTicker,
  ON_KEY, CHANNELS_KEY, EMOJIS_KEY, CYCLE_KEY, LAST_POST_KEY, MIRROR_KEY, DEFAULT_EMOJIS, _seenCount,
};
