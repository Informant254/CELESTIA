const config = require('../config/config');
const ui = require('../utils/ui');
const { isOwner } = require('../utils/isOwner');

// Private contact relay: strangers can reach the owner through her without
// ever seeing the owner's number. WhatsApp always shows *some* sender
// number — here it is hers (the bot), never the owner's.
const COOLDOWN_MS = 60 * 1000;
const MAX_LEN = 500;
const recentRelay = new Map(); // sender bare -> timestamp (bounded)

function senderJidOf(msg) {
  const jid = msg.key.remoteJid;
  if (String(jid || '').endsWith('@g.us')) {
    return msg.key.participantPn || msg.key.participantAlt || msg.key.participant;
  }
  return msg.key.remoteJidAlt || jid;
}

function contactCard() {
  const infoText = ui.renderCard('👑 OWNER INFO', [
    ui.renderInfo('🤖', 'Bot', 'CELESTIA'),
    ui.renderInfo('👤', 'Owner', 'CELESTIA Owner'),
    ui.renderInfo('🔒', 'Contact', 'Private'),
  ]);
  return (
    infoText +
    '\n\n_To reach them privately without seeing their number:_\n.owner <your message> — she delivers it directly.'
  );
}

module.exports = {
  name: 'owner',
  description: 'Shows information about the bot owner.',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = (args || []).join(' ').trim();

    // No message (or the owner themselves): just the private card.
    if (!text || isOwner(msg)) {
      return sock.sendMessage(jid, { text: contactCard() }, { quoted: msg });
    }

    const senderJid = senderJidOf(msg);
    const bare = String(senderJid || '').split('@')[0].split(':')[0].trim();
    if (!bare) {
      return sock.sendMessage(jid, { text: contactCard() }, { quoted: msg });
    }

    const key = bare.toLowerCase();
    const now = Date.now();
    if (now - (recentRelay.get(key) || 0) < COOLDOWN_MS) {
      return sock.sendMessage(jid, { text: '⏳ _She already carried your words — give them a minute before sending another._' }, { quoted: msg });
    }
    recentRelay.set(key, now);
    if (recentRelay.size > 500) recentRelay.delete(recentRelay.keys().next().value);

    const message = text.slice(0, MAX_LEN);
    const ownerJid = `${String(config.ownerNumber || '').replace(/\D/g, '')}@s.whatsapp.net`;

    // Remember the inbound thread so .ghost inbox shows it and the owner
    // can answer with .ghost — the requester never sees the owner's number.
    try {
      const settingsStore = require('../utils/settingsStore');
      const threads = settingsStore.get('ghost_threads', {});
      const threadKey = bare.replace(/[^0-9]/g, '') || key;
      threads[threadKey] = threads[threadKey] || [];
      threads[threadKey].push({ text: message.slice(0, 300), ts: now, dir: 'in' });
      settingsStore.set('ghost_threads', threads);
    } catch { /* relay never breaks on bookkeeping */ }

    try {
      await sock.sendMessage(ownerJid, {
        text:
          '📩 *A private contact request:*\n\n"' + message + '"\n\n' +
          '_From @' + bare + ' — answer with .ghost and she will deliver it without revealing your number._',
        mentions: [senderJid],
      });
    } catch {
      return sock.sendMessage(jid, { text: '❌ _She could not reach them just now — try again in a bit._' }, { quoted: msg });
    }

    return sock.sendMessage(jid, { text: '✅ *Delivered privately.*\n\n_They will reply through her — their number stays hidden._' }, { quoted: msg });
  },
};
