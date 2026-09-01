const axios = require('axios');
const { isSudo } = require('../utils/isSudo');
module.exports = {
  name: 'pair',
  aliases: ['rent'],
  description: 'Get a WhatsApp pairing code for a number (owner/sudo only)',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    if (!isSudo(msg)) {
      return;
    }
    const q = args.join(' ').trim();
    if (!q) {
      return await sock.sendMessage(
        jid,
        { text: 'Please provide a valid WhatsApp number.\n\nExample: .pair 254754574XXX' },
        { quoted: msg }
      );
    }
    const numbers = q
      .split(',')
      .map((v) => v.replace(/[^0-9]/g, ''))
      .filter((v) => v.length > 5 && v.length < 20);
    if (numbers.length === 0) {
      return await sock.sendMessage(
        jid,
        { text: '❌ Invalid number. Please use the correct format.' },
        { quoted: msg }
      );
    }
    for (const number of numbers) {
      try {
        const whatsappId = number + '@s.whatsapp.net';
        const [result] = await sock.onWhatsApp(whatsappId);
        if (!result?.exists) {
          await sock.sendMessage(
            jid,
            { text: `❗ ${number} is not registered on WhatsApp.` },
            { quoted: msg }
          );
          continue;
        }
        const requestingMsg = await sock.sendMessage(
          jid,
          { text: `⏳ Requesting pairing code for ${number}...` },
          { quoted: msg }
        );
        const { data } = await axios.get(
          `https://session2-bvny.onrender.com/code?number=${number}`
        );
        const code = data.code;
        if (!code) {
          throw new Error('No code returned from pairing service.');
        }
        // Code goes in its own message, alone, wrapped in backticks —
        // a tap/long-press then selects exactly the code, nothing else.
        await sock.sendMessage(jid, { text: `\`${code}\`` });
        // Edit the original "Requesting..." message in place instead of
        // sending a third message — keeps the chat cleaner.
        await sock.sendMessage(
          jid,
          {
            text: `🔗 Pairing code for ${number} below — tap and hold to copy.`,
            edit: requestingMsg.key,
          }
        );
      } catch (error) {
        console.error('[PAIR ERROR]', error);
        await sock.sendMessage(
          jid,
          { text: `⚠️ Failed to get pairing code for ${number}.` },
          { quoted: msg }
        );
      }
    }
  },
};
