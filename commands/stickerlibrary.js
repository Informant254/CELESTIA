const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { isOwner } = require('../utils/isOwner');
const library = require('../autochat/stickerLibrary');

function reply(sock, msg, text) {
  return sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
}

const saveSticker = {
  name: 'savesticker',
  aliases: ['learnsticker'],
  description: 'Save a replied sticker for autochat: .savesticker <mood>',
  async execute(sock, msg, args) {
    if (!isOwner(msg)) return reply(sock, msg, '❌ *Only the owner can teach sticker packs.*');
    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
    const quoted = ctx.quotedMessage;
    if (!quoted?.stickerMessage) return reply(sock, msg, '❌ Reply to a sticker with *.savesticker <mood>*');
    try {
      const buffer = await downloadMediaMessage(
        { message: quoted, key: { remoteJid: msg.key.remoteJid, id: ctx.stanzaId, participant: ctx.participant } },
        'buffer', {}, { reuploadRequest: sock.updateMediaMessage }
      );
      const result = library.add(buffer, args[0]);
      return reply(sock, msg, `✅ Sticker ${result.duplicate ? 'updated' : 'saved'} as *${result.entry.mood}* (ID: ${result.entry.id.slice(0, 8)}).`);
    } catch (error) {
      return reply(sock, msg, `❌ Could not save sticker: ${String(error.message || error).slice(0, 120)}`);
    }
  },
};

const myStickers = {
  name: 'mystickers',
  aliases: ['savedstickers'],
  description: 'List stickers saved for autochat',
  async execute(sock, msg) {
    if (!isOwner(msg)) return reply(sock, msg, '❌ *Owner only.*');
    const entries = library.list();
    if (!entries.length) return reply(sock, msg, '✨ No saved stickers yet. Reply to one with *.savesticker happy*.');
    const lines = entries.map((entry, index) => `${index + 1}. *${entry.mood}* — ${entry.id.slice(0, 8)}`);
    return reply(sock, msg, `✨ *AUTOCHAT STICKERS (${entries.length})*\n\n${lines.join('\n')}\n\nDelete: *.delsticker <number>*`);
  },
};

const deleteSticker = {
  name: 'delsticker',
  aliases: ['deletesticker'],
  description: 'Delete a saved autochat sticker',
  async execute(sock, msg, args) {
    if (!isOwner(msg)) return reply(sock, msg, '❌ *Owner only.*');
    if (!args[0]) return reply(sock, msg, '❌ Usage: *.delsticker <number or ID>*');
    const removed = library.remove(args[0]);
    return reply(sock, msg, removed ? `🗑️ Deleted *${removed.mood}* sticker ${removed.id.slice(0, 8)}.` : '❌ Sticker not found. Check *.mystickers*.');
  },
};

const autoSticker = {
  name: 'autosticker',
  aliases: ['chatstickers'],
  description: 'Let autochat use your saved stickers in this chat',
  async execute(sock, msg, args) {
    if (!isOwner(msg)) return reply(sock, msg, '❌ *Owner only.*');
    const jid = msg.key.remoteJid;
    const value = String(args[0] || '').toLowerCase();
    if (value === 'on' || value === 'off') library.setEnabled(jid, value === 'on');
    return reply(sock, msg, `✨ Autochat stickers are *${library.isEnabled(jid) ? 'ON' : 'OFF'}* in this chat.\nSaved: ${library.list().length}\n\n*.autosticker on|off*`);
  },
};

module.exports = [saveSticker, myStickers, deleteSticker, autoSticker];
