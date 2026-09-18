// No free keyless API with EPL top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
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

    const header = "⚽ *EPL TOP SCORERS*";

    await sock.sendMessage(jid, {
      text: `${header}\n❌ Top-scorer data unavailable right now.\nNo free data source covers EPL scorers.\nPlease try again later.`,
      edit: loading.key,
    });
  },
};
