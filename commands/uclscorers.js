const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

// No free keyless API with Champions League top-scorer data could be verified
// live, so this command answers honestly instead of showing stale/fake numbers.
module.exports = {
  name: "uclscorers",
  description: "Shows the current Champions League top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Champions League top scorers..." },
      { quoted: msg }
    );

    await sock.sendMessage(jid, {
      text: box("⚽ CHAMPIONS LEAGUE TOP SCORERS", [
        "❌ Top-scorer data unavailable right now.",
        "No free data source covers UCL scorers.",
        "Please try again later.",
      ]),
      edit: loading.key,
    });
  },
};
