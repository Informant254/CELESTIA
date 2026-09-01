const axios = require("axios");
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: "serieascorers",
  description: "Shows the current Serie A top scorers.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const loading = await sock.sendMessage(jid, { text: "🏆 Fetching Serie A top scorers..." }, { quoted: msg });

    try {
      const { data } = await axios.get(`${KEITH_BASE}/seriea/scorers`);
      if (!data.status || !data.result?.scorers) throw new Error("No scorers available.");

      const scorers = data.result.scorers;
      let text = `⚽ *${data.result.competition || 'Serie A'} Top Scorers*\n\n`;
      scorers.forEach((s, i) => {
        text += `${i + 1}. ${s.player || s.name} (${s.team}) — ${s.goals} goals\n`;
      });

      await sock.sendMessage(jid, { text, edit: loading.key });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Failed to fetch top scorers.\n\n${err.message}`, edit: loading.key });
    }
  },
};
