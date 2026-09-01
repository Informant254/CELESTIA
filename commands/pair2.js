const axios = require('axios');
const { isSudo } = require('../utils/isSudo');

module.exports = {
  name: 'pair2',
  aliases: ['rent2'],
  description: 'Get a WhatsApp pairing code using Kingpin (owner/sudo only)',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    if (!isSudo(msg)) {
      return;
    }

    const q = args.join(' ').trim();

    if (!q) {
      return await sock.sendMessage(
        jid,
        {
          text: 'Please provide a valid WhatsApp number.\n\nExample: .pair2 254754574XXX'
        },
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
            {
              text: `❗ ${number} is not registered on WhatsApp.`
            },
            { quoted: msg }
          );
          continue;
        }

        const requestingMsg = await sock.sendMessage(
          jid,
          {
            text: `⏳ Requesting pairing code for ${number}...`
          },
          { quoted: msg }
        );

        const { data } = await axios.get(
          `https://kingpin-3e2m.onrender.com/code?number=${number}`
        );

        const code = data?.code;

        if (!code) {
          throw new Error('No code returned from Kingpin pairing service.');
        }

        await sock.sendMessage(jid, {
          text: `\`${code}\``
        });

        await sock.sendMessage(
          jid,
          {
            text: `🔗 Pairing code for ${number} below — tap and hold to copy.`,
            edit: requestingMsg.key
          }
        );
      } catch (error) {
        console.error('[PAIR2 ERROR]', error);

        await sock.sendMessage(
          jid,
          {
            text: `⚠️ Failed to get pairing code for ${number}.`
          },
          { quoted: msg }
        );
      }
    }
  }
};
