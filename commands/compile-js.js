const { node } = require('compile-run');
const { isOwner } = require('../utils/isOwner');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'compile-js',
  aliases: ['run-js'],
  description: 'Run JavaScript code. Usage: .run-js <code> (or reply to a message containing code)',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isOwner(msg) && !isSudo(msg)) {
      return sock.sendMessage(jid, { text: '*Command meant for the owner*' }, { quoted: msg });
    }

    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = ctx?.quotedMessage;
    const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || null;
    const sourcecode = quotedText || args.join(' ');

    if (!sourcecode) {
      return sock.sendMessage(jid, { text: 'Quote/tag a Js code to compile.' }, { quoted: msg });
    }

    try {
      const result = await node.runSource(sourcecode);
      if (result.stdout) await sock.sendMessage(jid, { text: result.stdout }, { quoted: msg });
      if (result.stderr) await sock.sendMessage(jid, { text: result.stderr }, { quoted: msg });
      if (!result.stdout && !result.stderr) {
        await sock.sendMessage(jid, { text: '_No output._' }, { quoted: msg });
      }
    } catch (err) {
      await sock.sendMessage(jid, { text: String(err) }, { quoted: msg });
    }
  },
};
