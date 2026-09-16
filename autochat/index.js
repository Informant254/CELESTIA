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

function mode() {
  return settingsStore.get(MODE_KEY, 'off');
}

function isGroup(jid) {
  return String(jid || '').endsWith('@g.us');
}

function contactName(msg) {
  return msg.pushName || msg.verifiedBizName || null;
}

async function handleIncoming(sock, msg, text) {
  const chatId = msg.key.remoteJid;
  const t = String(text || '').trim();
  const fromMe = !!msg.key.fromMe;

  // Always learn from the owner's own texts (voice bank), never answer them.
  if (fromMe) {
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
  if (isGroup(chatId) && m !== 'all') return false;
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
    memory.push(chatId, 'me', res.text);

    // human rhythm: read pause -> typing -> paced bubbles
    await human.presence(sock, chatId, 'composing', human.readDelayMs(t.length));
    const parts = human.chunk(res.text);
    for (let i = 0; i < parts.length; i++) {
      try {
        await sock.sendPresenceUpdate('composing', chatId);
      } catch { /* cosmetic */ }
      await human.sleep(human.typeDelayMs(parts[i].length));
      await sock.sendMessage(chatId, { text: parts[i] }, { quoted: i === 0 ? msg : undefined });
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

module.exports = { handleIncoming, mode, MODE_KEY };
