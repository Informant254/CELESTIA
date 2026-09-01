module.exports = {
  name: 'owner',
  description: "Shows the bot owner's contact info.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    // ── Customize these details ────────────────────────────────────────────
    const ownerName = 'ᴾᴬᴾᴾᴵ ᴵˢᴬᴬᶜ';
    const ownerNumber = '254718701810'; // digits only, with country code, no +

    const vcard =
      'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${ownerName}\n` +
      `ORG:CELESTIA BOT;\n` +
      `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
      'END:VCARD';

    const infoText = `
╭──〔 👑 OWNER INFO 〕──╮
🤖 *Bot:* CELESTIA
👤 *Owner:* ${ownerName}
📱 *Contact:* +${ownerNumber}
╰──────────────────╯`.trim();

    // Send the info text first
    await sock.sendMessage(jid, { text: infoText }, { quoted: msg });

    // Then send the saveable contact card
    await sock.sendMessage(jid, {
      contacts: {
        displayName: ownerName,
        contacts: [{ vcard }]
      }
    }, { quoted: msg });
  },
};
