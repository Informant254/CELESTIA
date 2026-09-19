const ui = require("../utils/ui");

// No Euro tournament is currently running and no free keyless API with current
// Euro standings could be verified live, so this command answers honestly
// instead of showing stale or fake tables.
module.exports = {
  name: "euro",
  description: "Shows current Euro Championship standings.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Euro standings..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("🏆 EURO CHAMPIONSHIP", [
        "Euro standings unavailable right now.",
        "No Euro tournament is currently running.",
        "Please check back during the next Euros.",
      ]),
      edit: loading.key,
    });
  },
};
