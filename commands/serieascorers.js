// No free keyless API with Serie A top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
const ui = require("../utils/ui");

module.exports = {
  name: "serieascorers",
  description: "Shows the current Serie A top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Serie A top scorers..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("⚽ SERIE A TOP SCORERS", [
        "Top-scorer data unavailable right now.",
        "No free data source covers Serie A scorers.",
        "Please try again later.",
      ]),
      edit: loading.key,
    });
  },
};
