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

// Humans often react instead of replying. Trivial incoming → sometimes just
// an emoji react, no text. Keeps her from over-answering like a helpdesk.
const REACT_SET = {
  savage: ['😂', '💀', '🔥', '😭', '👍'],
  chill: ['😂', '❤️', '👍', '🔥'],
};

function pickReact(t) {
  const s = String(t || '').toLowerCase();
  let vibe = 'savage';
  try {
    vibe = require('../utils/settingsStore').get('autochat_vibe', 'savage') === 'chill' ? 'chill' : 'savage';
  } catch { /* default */ }
  if (/lol|haha|funny|dead|😂|🤣/.test(s)) return '😂';
  if (/thank|asante|shukran/.test(s)) return vibe === 'chill' ? '❤️' : '🙏';
  if (/^(ok|okay|sawa|poa|yeah|yes|bet)\b/.test(s)) return '👍';
  if (/sorry|pole/.test(s)) return '🥺';
  if (/happy|birthday|congrats|hongera/.test(s)) return '🎉';
  const set = REACT_SET[vibe] || REACT_SET.savage;
  return set[Math.floor(Math.random() * set.length)];
}

function shouldReact(t) {
  const s = String(t || '').trim();
  if (!s || s.length > 15) return false;
  if (/\b(?:sick|died|dead|scared|afraid|broke up|hurt|crying|stop|suicide|kill myself|depressed|sorry|pole)\b/i.test(s)) return false;
  if (s.includes('?')) return false;
  if (/https?:\/\//.test(s)) return false;
  if (/^\d{1,2}$/.test(s)) return false;
  if (!/(?:lol|haha|😂|🤣|thank|asante|shukran|^(?:ok|okay|sawa|poa|yeah|yes|bet)\b|happy|birthday|congrats|hongera)/i.test(s)) return false;
  return Math.random() < 0.18;
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

// Cross-turn loop guard: never send something she already said.
// Compares normalized text against her last 3 replies in this chat.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isRepeat(text, chatId) {
  const n = norm(text);
  if (!n) return true;
  const mine = memory.get(chatId).filter((m) => m.role === 'me').slice(-3).map((m) => norm(m.text));
  for (const p of mine) {
    if (!p) continue;
    if (p === n) return true;
    const a = new Set(n.split(' ').filter(Boolean));
    const b = new Set(p.split(' ').filter(Boolean));
    if (a.size >= 3 && b.size >= 3) {
      const inter = [...a].filter((w) => b.has(w)).length;
      if (inter / Math.min(a.size, b.size) >= 0.8) return true;
    }
  }
  return false;
}

// Flow driver: two straight statements with no question → nudge one
// genuine follow-up so the conversation breathes instead of stalling.
function needsQuestion(chatId, incoming) {
  const text = String(incoming || '').trim();
  if (text.length < 18 || /\?|\b(?:bye|goodnight|good night|later|okay|ok|sawa|thanks|asante|stop|sorry|pole)\b/i.test(text)) return false;
  const last = memory.get(chatId).filter((m) => m.role === 'me').slice(-1)[0];
  if (last?.text.includes('?')) return false;
  const learnedRate = voice.profile().questionRate;
  return Math.random() < Math.min(0.7, Math.max(0.08, learnedRate * 0.72));
}

// Threaded delivery: the first bubble quotes the triggering message so the
// reply lands on a specific message instead of dropping randomly; follow-up
// bubbles stay bare like a real person. Falls back to bare on quote failure.
async function sendThreaded(sock, chatId, msg, payload, quoteFirst) {
  if (!quoteFirst) return sock.sendMessage(chatId, payload);
  try {
    return await sock.sendMessage(chatId, payload, { quoted: msg });
  } catch {
    return sock.sendMessage(chatId, payload);
  }
}

function sanitizeReply(text) {
  let value = String(text || '').trim();
  value = value.replace(/^(?:assistant|reply|response|you)\s*:\s*/i, '').replace(/^['"]|['"]$/g, '').trim();
  value = value.replace(/\n{3,}/g, '\n\n');
  const words = value.split(/\s+/);
  if (words.length > 55) value = `${words.slice(0, 55).join(' ').replace(/[,:;-]$/, '')}...`;
  return value;
}

function canHandle(sock, msg) {
  const chatId = msg.key.remoteJid;
  if (msg.key.fromMe || mode() === 'off' || !backend.hasKey()) return false;
  if (isGroup(chatId) && !(mode() === 'all' || isGroupAllowed(chatId))) return false;
  if (isGroup(chatId) && !groupGate(sock, msg)) return false;
  return true;
}

async function handleIncoming(sock, msg, text, options = {}) {
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

  // One message, one answer: redeliveries (decrypt retries, history/con reconnect
  // replays) that pass the gates above must not run the brain chain again —
  // that's the double-reply-different-models bug. Declines never claim, so
  // fall-through to other handlers keeps working.
  if (!require('./dedup').claim('auto', chatId, msg.key?.id)) return true;

  // Incoming from a contact: buffer it, learn their street language, answer.
  memory.push(chatId, 'them', t);
  try {
    require('./dialect').harvest(chatId, t);
  } catch { /* dialect never breaks chat */ }
  // ...unless a react says it better. No text, no machinery, just human.
  if (!options.voiceReply && shouldReact(t)) {
    try {
      const emoji = pickReact(t);
      await sock.sendMessage(chatId, { react: { text: emoji, key: msg.key } });
      memory.push(chatId, 'me', `[reacted ${emoji}]`);
      return true;
    } catch { /* fall through to a text reply */ }
  }
  try {
    const generationStarted = Date.now();
    await sock.sendPresenceUpdate(options.voiceReply ? 'recording' : 'composing', chatId).catch(() => {});
    const { system, user } = persona.build({
      chatId,
      incoming: t,
      pushName: sock.user?.name || null,
      contactName: contactName(msg),
      flirt: require('./flirt').isAllowed(msg),
    });
    const res = await backend.complete(
      system,
      needsQuestion(chatId, t) ? `${user}\n(Ask one brief follow-up only if it feels natural here.)` : user,
      { preferProvider: 'codex' }
    );
    if (!res || !res.text) return false;
    console.log(`[autochat] engine: ${res.engine || 'unknown'}`);
    let replyText = sanitizeReply(res.text);
    // Loop guard: a brain stuck repeating one word gets ONE fresh sample.
    if (isDegenerate(replyText, chatId) || isRepeat(replyText, chatId)) {
      console.log('[autochat] degenerate/repeat reply, resampling once');
      const retry = await backend.complete(
        system,
        `${user}\n(Say it completely differently from your last replies. Never repeat one word.)`,
        { preferProvider: 'codex' }
      );
      if (retry && retry.text && !isDegenerate(retry.text, chatId) && !isRepeat(retry.text, chatId)) {
        console.log(`[autochat] engine: ${retry.engine || 'unknown'} (resample)`);
        replyText = sanitizeReply(retry.text);
      }
    }
    // Operate bot functions first (imagine/video/aisticker/tts), then
    // deliver the remaining chat text. Needs commands via options.
    let sentSavedSticker = false;
    try {
      const functions = require('./functions');
      const fx = functions.extract(replyText);
      if (fx.func && options.commands) {
        const ran = await functions.run(sock, msg, options.commands, fx.func, fx.arg);
        sentSavedSticker = ran && fx.func === 'mysticker';
        replyText = fx.clean;
      }
    } catch (e) {
      console.error('[autochat] function failed:', String(e.message).slice(0, 100));
    }
    if (!replyText) {
      memory.push(chatId, 'me', '[ran a function]');
      try {
        await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
      } catch { /* cosmetic */ }
      return true;
    }
    if (options.voiceReply) {
      try {
        const remaining = Math.max(0, human.readDelayMs(t.length) - (Date.now() - generationStarted));
        if (remaining) await human.sleep(remaining);
        const audio = await require('../utils/speech').synthesizeVoice(replyText, options.language || 'en-US');
        const sentMsg = await sendThreaded(sock, chatId, msg, { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true }, true);
        noteSent(chatId, sentMsg?.key?.id);
        memory.push(chatId, 'me', replyText);
        await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
        return true;
      } catch (e) {
        console.error('[autochat] voice synthesis failed; using text:', String(e.message).slice(0, 100));
      }
    }

    // human rhythm: read pause -> typing -> paced bubbles
    const parts = human.chunk(replyText);
    for (let i = 0; i < parts.length; i++) {
      try {
        await sock.sendPresenceUpdate('composing', chatId);
      } catch { /* cosmetic */ }
      const elapsed = Date.now() - generationStarted;
      const remaining = Math.max(0, Math.min(3000, human.typeDelayMs(parts[i].length) - elapsed));
      if (remaining) await human.sleep(remaining);
      try {
        // Threaded reply: first bubble quotes the triggering message so it
        // answers a specific message; follow-up bubbles stay bare.
        const sentMsg = await sendThreaded(sock, chatId, msg, { text: parts[i] }, i === 0);
        noteSent(chatId, sentMsg?.key?.id);
      } catch (e) {
        console.error('[autochat] send failed:', String(e.message).slice(0, 100));
        return false;
      }
      if (i < parts.length - 1) await human.sleep(900 + Math.random() * 1200);
    }
    memory.push(chatId, 'me', replyText);
    // Saved-pack stickers are opt-in per chat and deliberately occasional.
    // Explicit sticker requests bypass the probability, but still require ON.
    try {
      const stickers = require('./stickerLibrary');
      if (!sentSavedSticker && stickers.shouldSend(chatId, t, replyText)) {
        const mood = stickers.detectMood(`${t}\n${replyText}`);
        const selected = stickers.pick(mood);
        if (selected) {
          const sentSticker = await sock.sendMessage(chatId, { sticker: selected.buffer });
          noteSent(chatId, sentSticker?.key?.id);
          memory.push(chatId, 'me', `[sent ${selected.entry.mood} sticker]`);
        }
      }
    } catch (e) {
      console.error('[autochat] saved sticker failed:', String(e.message || e).slice(0, 100));
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

module.exports = { handleIncoming, canHandle, mode, MODE_KEY, isGroupAllowed, setGroupAllowed, groupList, groupGate, noteSent };
