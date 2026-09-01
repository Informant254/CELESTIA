const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'enc',
  aliases: ['encrypte'],
  description: 'Obfuscate/encrypt JavaScript code. Quote a message containing JS code with .enc',
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg) && !isSudo(msg)) {
      return sock.sendMessage(jid, { text: '*Command meant for the owner*' }, { quoted: msg });
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';

    if (!quotedText) {
      return sock.sendMessage(jid, { text: 'Quote/Tag a valid JavaScript code to encrypt!' }, { quoted: msg });
    }

    try {
      const Obf = require('javascript-obfuscator');
      const result = Obf.obfuscate(quotedText, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: true,
        stringArrayThreshold: 1,
      });
      await sock.sendMessage(jid, { text: result.getObfuscatedCode() }, { quoted: msg });
    } catch (err) {
      console.error('[ENC ERROR]', err.message);
      await sock.sendMessage(jid, { text: `❌ Obfuscation failed: ${err.message}` }, { quoted: msg });
    }
  },
};
