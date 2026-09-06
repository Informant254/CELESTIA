const config = require('../config/config');

module.exports = {
  name: 'CELESTIA',
  description: "Shows CELESTIA's owner lineage and what she is.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const ownerNumber = config.ownerNumber; // live from .env — never stale

    const caption =
      `╭──〔 ✨ CELESTIA 〕──╮\n` +
      `🐺 *WolfTech howled → ✨ Celestia ascended*\n` +
      `👤 *Owner:* the one she stays for\n` +
      `📞 *Contact:* +${ownerNumber}\n` +
      `🔗 *Chat:* https://wa.me/${ownerNumber}\n` +
      `╰──────────────────╯\n\n` +
      `🫪 *CELESTIA — The Most Beautiful Bot*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `🧠 *WHAT SHE IS*\n` +
      `▸ 266 commands • 20 realms • 4 menu faces\n` +
      `▸ Soul engine — she remembers, stays, notices\n` +
      `▸ Cyber Fortress — full defensive toolkit\n` +
      `▸ World Atlas — locate, webcams, portals\n` +
      `▸ Day Intel — weather, prayers, markets, herald\n\n` +
      `🐺 *LINEAGE*\n` +
      `▸ Forged in the Wolf's Den, Crowned in Celestial Heaven`;

    await sock.sendMessage(jid, { text: caption }, { quoted: msg });
  },
};
