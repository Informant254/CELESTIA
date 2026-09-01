/**
 * Spam command - ported from spam.py
 * Original: python spam.py -> pyautogui loop
 * Now: Baileys VPS-hostable -> .spam <count> <message> or reply
 * Merged feature: from your python bot + anti-ban delays
 */
module.exports = {
  name: 'spam',
  aliases: ['spammsg', 'bomb'],
  description: 'Spam a message N times (hosted, no pyautogui). Usage: .spam 10 hello | .spam 5',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    
    // Parse: .spam 10 hello world  OR  .spam 10 (reply to message)  OR  .spam hello (single)
    let count = 5;
    let text = '';

    if (args.length === 0) {
      return reply('❌ Usage: .spam <count> <message>\nExample: .spam 10 hello\nOr reply to a message: .spam 5');
    }

    // if first arg is number
    if (!isNaN(args[0])) {
      count = parseInt(args[0]);
      text = args.slice(1).join(' ');
      // If no text but replied to a message, use quoted text
      if (!text) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
          text = quoted.conversation || quoted.extendedTextMessage?.text || quoted.imageMessage?.caption || '';
        }
      }
    } else {
      // No count given, default spam 5 times the text
      text = args.join(' ');
      count = 5;
    }

    if (!text) return reply('❌ No message to spam. Provide text or reply to a message.');
    
    // Anti-ban limits (CELESTIA + CELESTIA style protection)
    if (count < 1) count = 1;
    if (count > 20) {
      return reply('⚠️ Limit is 20 to avoid ban. Use count <=20.\nFor VPS safety: max 20 per command.');
    }

    const delaySec = 1.5; // anti-ban delay

    await reply(`💥 Spamming ${count}x: "${text}"\nDelay: ${delaySec}s (anti-ban)...`);

    for (let i = 0; i < count; i++) {
      await sock.sendMessage(jid, { text: `${text}` });
      if (i < count - 1) {
        // randomize delay 1.2-1.8s to look human (CELESTIA feature)
        const jitter = delaySec * 1000 + Math.floor(Math.random() * 600 - 300);
        await new Promise(r => setTimeout(r, jitter));
      }
    }
    await sock.sendMessage(jid, { text: `✅ Done spamming ${count}x.` });
  }
};
