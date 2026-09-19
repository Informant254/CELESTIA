// No free keyless API with EPL top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
const ui = require("../utils/ui");

module.exports = {
  name: "eplscorers",
  description: "Shows the current EPL top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching EPL top scorers..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("⚽ EPL TOP SCORERS", [
        "Top-scorer data unavailable right now.",
        "No free data source covers EPL scorers.",
        "Please try again later.",
      ]),
      edit: loading.key,
    });
  },
};
