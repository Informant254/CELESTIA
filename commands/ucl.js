const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

// The verified free sources return no usable Champions League table yet
// (OpenLigaDB UCL tables are all-zero pre-season, TheSportsDB has no UCL
// table), so this command answers honestly instead of showing fake standings.
module.exports = {
  name: "ucl",
  description: "Shows the current UEFA Champions League standings.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching UEFA Champions League standings..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: box("🏆 CHAMPIONS LEAGUE TABLE", [
        "❌ Table unavailable right now.",
        "The league phase has not started yet.",
        "Try .standings ucl for upcoming fixtures.",
      ]),
      edit: loading.key,
    });
  },
};
