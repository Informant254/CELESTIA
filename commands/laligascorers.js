// No free keyless API with La Liga top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
const ui = require("../utils/ui");

module.exports = {
  name: "laligascorers",
  description: "Shows the current La Liga top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching La Liga top scorers..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("⚽ LA LIGA TOP SCORERS", [
        "Top-scorer data unavailable right now.",
        "No free data source covers La Liga scorers.",
        "Please try again later.",
      ]),
      edit: loading.key,
    });
  },
};
