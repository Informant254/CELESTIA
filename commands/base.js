const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'base',
  aliases: ['base64', 'encodebase64'],
  description: 'Encodes text or quoted message to Base64.',
  async execute(sock, msg, args = []) {
    console.log("[BASE] execute started");
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    if (!isOwner(msg) && !isSudo(msg)) {
      return sock.sendMessage(jid, { text: '*Command meant for the owner*' }, { quoted: msg });
    }

    let textToEncode = args.join(" ");
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!textToEncode && quoted) {
      textToEncode =
        quoted.conversation ||
        quoted.extendedTextMessage?.text ||
        "";
    }

    if (!textToEncode) {
      const errorMsg = "❌ *Please provide text or reply to a message to encode!*\n\n*Usage:* `.base hello world`";
      return await sock.sendMessage(jid, { text: errorMsg }, { quoted: msg });
    }

    try {
      const encodedText = Buffer.from(textToEncode, "utf-8").toString("base64");
      const text = `🔒 *Base64 Encoded Result:*\n\n${encodedText}`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (error) {
      console.error("[BASE] Error:", error);
      await sock.sendMessage(jid, { text: "⚠️ *Failed to encode text.*" }, { quoted: msg });
    }
  },
};
