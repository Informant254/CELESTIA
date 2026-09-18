// No free keyless API with Serie A top-scorer data could be verified live,
// so this command answers honestly instead of showing stale or fake numbers.
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

    const header = "⚽ *SERIE A TOP SCORERS*";

    await sock.sendMessage(jid, {
      text: `${header}\n❌ Top-scorer data unavailable right now.\nNo free data source covers Serie A scorers.\nPlease try again later.`,
      edit: loading.key,
    });
  },
};
