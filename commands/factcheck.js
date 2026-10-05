const { factCheckClaim, formatFactCheck } = require('../utils/factCheck');

function unwrapMessage(content) {
  let current = content;
  for (let index = 0; index < 5 && current; index += 1) {
    const wrapped = current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current || {};
}

function textFromMessage(content) {
  const message = unwrapMessage(content);
  return String(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  ).replace(/\s+/g, ' ').trim();
}

function extractClaim(msg, args) {
  const typed = String(Array.isArray(args) ? args.join(' ') : '').replace(/\s+/g, ' ').trim();
  if (typed) return typed.slice(0, 700);
  const current = unwrapMessage(msg.message);
  const quoted = current.extendedTextMessage?.contextInfo?.quotedMessage;
  return textFromMessage(quoted).slice(0, 700);
}

async function sendResult(sock, jid, msg, thinking, text) {
  try {
    return await sock.sendMessage(jid, { text, edit: thinking.key }, { quoted: msg });
  } catch {
    return sock.sendMessage(jid, { text }, { quoted: msg });
  }
}

module.exports = {
  name: 'factcheck',
  aliases: ['checkclaim', 'verifyclaim', 'debunk'],
  description: 'Verify a typed or replied claim against live evidence. Usage: .factcheck <claim>',
  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt ? msg.key.remoteJidAlt : rawJid;
    const claim = extractClaim(msg, args);
    if (!claim) {
      return sock.sendMessage(jid, {
        text: '🛡️ *CELESTIA VERIFY*\n\nUse `.factcheck <claim>` or reply to a text, image caption, or video caption with `.factcheck`.',
      }, { quoted: msg });
    }
    if (claim.length > 200) {
      return sock.sendMessage(jid, {
        text: '🛡️ Please shorten the claim to 200 characters or less so CELESTIA can verify the complete statement rather than only part of it.',
      }, { quoted: msg });
    }

    const thinking = await sock.sendMessage(
      jid,
      { text: '🛡️ Checking the claim against live independent evidence...' },
      { quoted: msg }
    );
    try {
      const result = await factCheckClaim(claim);
      console.log(`[CELESTIA VERIFY] verdict=${result.verdict} confidence=${result.confidence} sources=${result.evidence.length} engine=${result.engine}`);
      return sendResult(sock, jid, msg, thinking, formatFactCheck(result));
    } catch (error) {
      console.error('[CELESTIA VERIFY]', String(error.message || error).slice(0, 160));
      const text = /No reliable evidence pages/i.test(error.message)
        ? `❌ ${error.message}`
        : '❌ CELESTIA VERIFY is temporarily unavailable. Please try again shortly.';
      return sendResult(sock, jid, msg, thinking, text);
    }
  },
  unwrapMessage,
  textFromMessage,
  extractClaim,
};
