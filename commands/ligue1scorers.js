// No free keyless API with Ligue 1 top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
const ui = require("../utils/ui");

module.exports = {
  name: "ligue1scorers",
  description: "Shows the current Ligue 1 top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Ligue 1 top scorers..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("⚽ LIGUE 1 TOP SCORERS", [
        "Top-scorer data unavailable right now.",
        "No free data source covers Ligue 1 scorers.",
        "Please try again later.",
      ]),
      edit: loading.key,
    });
  },
};
