/**
 * autochat/index.js — orchestrator. Called from the message pipeline.
 *
 * Returns true when the message was consumed (reply sent or session kept).
 * Guards: off/dm-only/groups, prefix commands, own messages, no AI key.
 * fromMe messages are always harvested for voice, never answered.
 */
const settingsStore = require('../utils/settingsStore');
const backend = require('./backend');
const memory = require('./memory');
const voice = require('./voice');
const persona = require('./persona');
const human = require('./humanizer');

const MODE_KEY = 'autochat_mode'; // off | dm | all
const GROUPS_KEY = 'autochat_groups'; // group JIDs explicitly opted in

function mode() {
  return settingsStore.get(MODE_KEY, 'off');
}

function groupList() {
  const v = settingsStore.get(GROUPS_KEY, []);
  return Array.isArray(v) ? v : [];
}

function isGroupAllowed(chatId) {
  return groupList().includes(chatId);
}

function setGroupAllowed(chatId, on) {
  const list = groupList();
  const has = list.includes(chatId);
  if (on && !has) {
    list.push(chatId);
    settingsStore.set(GROUPS_KEY, list);
  } else if (!on && has) {
    settingsStore.set(GROUPS_KEY, list.filter((g) => g !== chatId));
  }
  return groupList();
}

function isGroup(jid) {
  return String(jid || '').endsWith('@g.us');
}

function contactName(msg) {
  return msg.pushName || msg.verifiedBizName || null;
}

// Message IDs she sent per chat (cap 50) — reply-to-her detection that
// survives LID/PN addressing mismatches.
const sentIds = new Map(); // chatId -> array of msg ids
function noteSent(chatId, id) {
  if (!id) return;
  if (!sentIds.has(chatId)) sentIds.set(chatId, []);
  const a = sentIds.get(chatId);
  a.push(id);
  while (a.length > 50) a.shift();
}

function bareJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

// True if this jid is the bot itself (PN or LID form).
// Checks live PN, recorded owner LID, and the self-learned bot LID
// (persisted — survives restarts, unlike the in-memory stanza list).
function isSelfJid(jid, sock) {
  if (!jid) return false;
  const b = bareJid(jid);
  const ownPn = bareJid(sock.user?.id);
  if (b && ownPn && b === ownPn) return true;
  try {
    const ss = require('../utils/settingsStore');
    const ownerLid = ss.get('ownerLid', null);
    if (ownerLid && b === bareJid(ownerLid)) return true;
    const botLid = ss.get('bot_lid', null);
    if (botLid && b === bareJid(botLid)) return true;
  } catch { /* ignore */ }
  return false;
}

// Learn her own LID from her own group traffic (fromMe participant IS her LID).
function learnSelfLid(msg) {
  try {
    const p = msg.key?.participant;
    if (msg.key?.remoteJid?.endsWith('@g.us') && p && String(p).endsWith('@lid')) {
      const ss = require('../utils/settingsStore');
      if (ss.get('bot_lid', null) !== p) ss.set('bot_lid', p);
    }
  } catch { /* never break chat */ }
}

// Group rule: answer ONLY on reply-to-her or tag. Returns false = stay silent.
function groupGate(sock, msg) {
  const m = msg.message || {};
  const ctx =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.stickerMessage?.contextInfo ||
    m.audioMessage?.contextInfo ||
    m.documentMessage?.contextInfo;
  if (!ctx) return false;
  // tag?
  const mentioned = ctx.mentionedJid || [];
  if (mentioned.some((j) => isSelfJid(j, sock))) return true;
  // reply to one of her messages? (stanza match = bulletproof, participant = backup)
  if (ctx.quotedMessage) {
    const mine = sentIds.get(msg.key.remoteJid) || [];
    if (ctx.stanzaId && mine.includes(ctx.stanzaId)) return true;
    const qp = ctx.participant || ctx.remoteJid;
    if (qp && isSelfJid(qp, sock)) return true;
  }
  return false;
}

// Degenerate = stuck in a loop: same single word as her last reply,
// or one word hammered 3+ times. Legit short replies ("bet 😂") pass.
function isDegenerate(text, chatId) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^(\S+)(?:\s+\1){2,}\s*[^\w\s]*$/i.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    const prev = memory.get(chatId).filter((m) => m.role === 'me').slice(-1)[0];
    if (prev && prev.text.trim().toLowerCase() === t.toLowerCase()) return true;
  }
  return false;
}

async function handleIncoming(sock, msg, text) {
  const chatId = msg.key.remoteJid;
  const t = String(text || '').trim();
  const fromMe = !!msg.key.fromMe;

  // Always learn from the owner's own texts (voice bank), never answer them.
  if (fromMe) {
    learnSelfLid(msg); // her LID lives here — persist it for reply/tag matching
    if (t) {
      voice.collect(t);
      memory.push(chatId, 'me', t);
    }
    return false;
  }

  if (!t) return false;

  // Never swallow download-session picks — the downloader owns bare numbers.
  try {
    const sessions = require('../download/sessions');
    const senderId = msg.key.participant || msg.key.remoteJid;
    if (/^\d{1,2}$/.test(t) && sessions.get(chatId, senderId)) return false;
  } catch { /* sessions never break chat */ }

  const m = mode();
  if (m === 'off') return false;
  // Groups: global 'all' mode, or this specific group was opted in —
  // and even then, ONLY on reply-to-her or tag. DMs always qualify.
  if (isGroup(chatId)) {
    if (!(m === 'all' || isGroupAllowed(chatId))) return false;
    if (!groupGate(sock, msg)) return false;
  }
  if (!backend.hasKey()) return false; // silent without a key — status shows why

  // Incoming from a contact: buffer it, think, answer like the owner.
  memory.push(chatId, 'them', t);
  try {
    const { system, user } = persona.build({
      chatId,
      incoming: t,
      pushName: sock.user?.name || null,
      contactName: contactName(msg),
    });
    const res = await backend.complete(system, user);
    if (!res || !res.text) return false;
    console.log(`[autochat] engine: ${res.engine || 'unknown'}`);
    let replyText = res.text;
    // Loop guard: a brain stuck repeating one word gets ONE fresh sample.
    if (isDegenerate(replyText, chatId)) {
      console.log('[autochat] degenerate reply, resampling once');
      const retry = await backend.complete(system, `${user}\n(Vary your wording. Never repeat one word.)`);
      if (retry && retry.text && !isDegenerate(retry.text, chatId)) {
        console.log(`[autochat] engine: ${retry.engine || 'unknown'} (resample)`);
        replyText = retry.text;
      }
    }
    memory.push(chatId, 'me', replyText);

    // human rhythm: read pause -> typing -> paced bubbles
    await human.presence(sock, chatId, 'composing', human.readDelayMs(t.length));
    const parts = human.chunk(replyText);
    for (let i = 0; i < parts.length; i++) {
      try {
        await sock.sendPresenceUpdate('composing', chatId);
      } catch { /* cosmetic */ }
      await human.sleep(human.typeDelayMs(parts[i].length));
      try {
        const sentMsg = await sock.sendMessage(chatId, { text: parts[i] }, { quoted: i === 0 ? msg : undefined });
        noteSent(chatId, sentMsg?.key?.id);
      } catch (e) {
        console.error('[autochat] send failed:', String(e.message).slice(0, 100));
        return false;
      }
      if (i < parts.length - 1) await human.sleep(900 + Math.random() * 1200);
    }
    try {
      await sock.sendPresenceUpdate('paused', chatId);
    } catch { /* cosmetic */ }
    return true;
  } catch (e) {
    console.error('[autochat] reply failed:', String(e.message).slice(0, 120));
    return false; // fail silent — never expose machinery to the contact
  }
}

module.exports = { handleIncoming, mode, MODE_KEY, isGroupAllowed, setGroupAllowed, groupList, groupGate, noteSent };
