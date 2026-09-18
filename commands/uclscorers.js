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

    const header = "⚽ *CHAMPIONS LEAGUE TOP SCORERS*";

    await sock.sendMessage(jid, {
      text: `${header}\n❌ Top-scorer data unavailable right now.\nNo free data source covers UCL scorers.\nPlease try again later.`,
      edit: loading.key,
    });
  },
};
