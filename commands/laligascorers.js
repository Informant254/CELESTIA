// No free keyless API with La Liga top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
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

    const header = "⚽ *LA LIGA TOP SCORERS*";

    await sock.sendMessage(jid, {
      text: `${header}\n❌ Top-scorer data unavailable right now.\nNo free data source covers La Liga scorers.\nPlease try again later.`,
      edit: loading.key,
    });
  },
};
