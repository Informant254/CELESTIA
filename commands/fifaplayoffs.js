const ui = require("../utils/ui");

// The verified free sources (OpenLigaDB wm2026 match data, TheSportsDB) only
// publish World Cup group-stage data — no knockout/playoff brackets — so this
// command answers honestly instead of inventing results.
module.exports = {
  name: "fifaplayoffs",
  description: "Shows current FIFA World Cup playoff/knockout results.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching FIFA playoffs..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: ui.renderNotice("🏆 WORLD CUP PLAYOFFS", [
        "Playoff results unavailable right now.",
        "No free data source publishes the bracket.",
        "Try .fifa for the group-stage table.",
      ]),
      edit: loading.key,
    });
  },
};
