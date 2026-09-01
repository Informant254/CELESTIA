const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'unbase',
  aliases: ['unbase64', 'decodebase64', 'debase'],
  description: 'Decodes Base64 encoded text or quoted message.',
  async execute(sock, msg, args = []) {
    console.log("[UNBASE] execute started");
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    if (!isOwner(msg) && !isSudo(msg)) {
      return sock.sendMessage(jid, { text: '*Command meant for the owner*' }, { quoted: msg });
    }

    let textToDecode = args.join(" ");
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!textToDecode && quoted) {
      textToDecode =
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        "";
    }

    if (!textToDecode) {
      const errorMsg = "❌ *Please provide a Base64 string or reply to a message!*\n\n*Usage:* `.unbase aGVsbG8gd29ybGQ=`";
      return await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
    }

    try {
      const cleanInput = textToDecode.trim();
      const decodedText = Buffer.from(cleanInput, "base64").toString("utf-8");

      if (!decodedText || decodedText.trim().length === 0) {
        throw new Error("Invalid output");
      }

      const text = `🔓 *Base64 Decoded Result:*\n\n${decodedText}`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      console.error("[UNBASE] Error:", error);
      await sock.sendMessage(jid, { text: "⚠️ *Failed to decode!* Please check if the input is valid Base64." }, { quoted: msg });
    }
  },
};
