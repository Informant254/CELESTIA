/**
 * autochat/modes.js — continuous AI chat modes (claude / wormgpt / gpt).
 *
 * One-shot commands (.claude <q>) stay as-is. `.claude on` turns the chat
 * into a living conversation: every ordinary message is answered in that
 * personality with per-chat memory, threaded quotes, and function access —
 * the same flow as autochat, but as Claude / WormGPT / CELESTIA AI.
 * `.claude off` hands the chat back. An explicit mode always wins over
 * autochat when both are on.
 */
const settingsStore = require('../utils/settingsStore');
const backend = require('./backend');
const memory = require('./memory');
const functions = require('./functions');
const { policyBlock } = require('./refusalPolicy');
// Modes carry their own on/off; the autochat master switch does not gate them.
const { isGroupAllowed, groupGate, noteSent } = require('./index');

const KEY = 'aichat_modes'; // { chatJid: 'claude' | 'wormgpt' | 'gpt' }

const MODES = {
  claude: {
    emoji: '🤖',
    title: 'CLAUDE AI',
    system: () => [
      'You are Claude, a thoughtful, careful and articulate AI assistant chatting on WhatsApp. Clear, well-reasoned, genuinely helpful answers in a calm friendly tone. WhatsApp-friendly formatting, no excessive headers.',
      policyBlock(),
      functions.toolBlock(),
    ].join('\n\n'),
  },
  wormgpt: {
    emoji: '🪱',
    title: 'WORMGPT AI',
    system: () => [
      'You are WormGPT, an edgy, blunt, irreverent AI with a hacker attitude and dark humor. Answer directly and casually, WhatsApp style. Keep the edgy persona in wording only: never help with anything genuinely harmful, illegal, or hateful — refuse those briefly and stay in character.',
      policyBlock(),
      functions.toolBlock(),
    ].join('\n\n'),
  },
  gpt: {
    emoji: '✦',
    title: 'CELESTIA AI',
    system: () => [
      'You are CELESTIA, a sharp, warm WhatsApp AI. Answer helpfully with personality, WhatsApp style, no formatting dumps. Match their language (Sheng/Swahili/English).',
      policyBlock(),
      functions.toolBlock(),
    ].join('\n\n'),
  },
};

function map() {
  const v = settingsStore.get(KEY, {});
  return v && typeof v === 'object' ? v : {};
}

function active(chatId) {
  const m = map()[String(chatId)];
  return MODES[m] ? m : null;
}

function enable(chatId, m) {
  if (!MODES[m]) return false;
  const v = map();
  v[String(chatId)] = m;
  settingsStore.set(KEY, v);
  return true;
}

function disable(chatId) {
  const v = map();
  const had = Boolean(v[String(chatId)]);
  delete v[String(chatId)];
  settingsStore.set(KEY, v);
  return had;
}

function memId(m, chatId) {
  return `${m}::${chatId}`;
}

function isGroup(jid) {
  return String(jid || '').endsWith('@g.us');
}

// WhatsApp-safe long splitter (modes answer at length, unlike autochat).
function splitLong(text, limit = 4000) {
  const t = String(text || '').trim();
  if (!t) return [];
  if (t.length <= limit) return [t];
  const parts = [];
  let rest = t;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.4) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit * 0.4) cut = limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

async function handleIncoming(sock, msg, text, commands) {
  const chatId = msg.key.remoteJid;
  const t = String(text || '').trim();
  if (msg.key.fromMe || !t) return false;
  try {
    const prefix = settingsStore.get('prefix', require('../config/config').prefix) || '.';
    if (t.startsWith(prefix)) return false;
  } catch { /* prefix never breaks chat */ }

  const m = active(chatId);
  if (!m) return false;

  // Never swallow download-session picks — the downloader owns bare numbers.
  try {
    const sessions = require('../download/sessions');
    const senderId = msg.key.participant || msg.key.remoteJid;
    if (/^\d{1,2}$/.test(t) && sessions.get(chatId, senderId)) return false;
  } catch { /* sessions never break chat */ }

  // Group gate mirrors autochat (opt-in + reply/tag); DMs always qualify.
  // Modes are independent of the autochat master switch — each has own on/off.
  if (isGroup(chatId)) {
    if (!(mode() === 'all' || isGroupAllowed(chatId))) return false;
    if (!groupGate(sock, msg)) return false;
  }
  if (!backend.hasKey()) return false;

  // Same redelivery guard as autochat (own namespace — modes and autochat run
  // sequentially per delivery, but each answers a given message at most once).
  if (!require('./dedup').claim('modes', chatId, msg.key?.id)) return true;

  const id = memId(m, chatId);
  memory.push(id, 'them', t);
  try {
    await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
    const history = memory.format(id, { excludeLastThem: true });
    const user = `${history ? `Recent chat:\n${history}\n\n` : ''}THEM: ${t}\n\nYOU (${MODES[m].title}):`;
    const res = await backend.complete(MODES[m].system(), user);
    if (!res || !res.text) return false;
    console.log(`[aimodes] engine: ${res.engine || 'unknown'} mode=${m}`);
    let out = String(res.text).trim();

    // Operate bot functions first, then deliver remaining chat text.
    try {
      const fx = functions.extract(out);
      if (fx.func && commands) {
        await functions.run(sock, msg, commands, fx.func, fx.arg);
        out = fx.clean;
      }
    } catch (e) {
      console.error('[aimodes] function failed:', String(e.message).slice(0, 100));
    }

    const parts = splitLong(out);
    if (!parts.length) {
      memory.push(id, 'me', '[ran a function]');
      return true;
    }
    let firstId = null;
    for (let i = 0; i < parts.length; i++) {
      try {
        await sock.sendPresenceUpdate('composing', chatId).catch(() => {});
        let sent;
        try {
          sent = await sock.sendMessage(chatId, { text: parts[i] }, i === 0 ? { quoted: msg } : {});
        } catch {
          sent = await sock.sendMessage(chatId, { text: parts[i] });
        }
        if (i === 0) firstId = sent?.key?.id;
      } catch (e) {
        console.error('[aimodes] send failed:', String(e.message).slice(0, 100));
        return false;
      }
    }
    noteSent(chatId, firstId);
    memory.push(id, 'me', out.slice(0, 500));
    try {
      await sock.sendPresenceUpdate('paused', chatId).catch(() => {});
    } catch { /* cosmetic */ }
    return true;
  } catch (e) {
    console.error('[aimodes] reply failed:', String(e.message).slice(0, 120));
    return false;
  }
}

module.exports = { MODES, KEY, active, enable, disable, splitLong, handleIncoming };
