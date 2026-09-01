const axios = require("axios");
const { KEITH_BASE } = require('../config/apis');

module.exports = {
  name: "fifaplayoffs",
  description: "Shows current FIFA World Cup playoff/knockout results.",
  async execute(sock, msg) {
    const jid = msg.key.remoteJid;
    const loading = await sock.sendMessage(jid, { text: "🏆 Fetching FIFA playoffs..." }, { quoted: msg });

    try {
      const { data } = await axios.get(`${KEITH_BASE}/fifa/playoffs`);
      if (!data.status || !data.result) throw new Error("No playoff data available.");

      const matches = Array.isArray(data.result) ? data.result : data.result.matches || [];
      if (!matches.length) throw new Error("No playoff matches found.");

      let text = `🏆 *FIFA World Cup — Playoffs*\n\n`;
      matches.forEach((m) => {
        text += `${m.round ? `*${m.round}*\n` : ''}${m.homeTeam || m.home} ${m.homeScore ?? ''} - ${m.awayScore ?? ''} ${m.awayTeam || m.away}\n\n`;
      });

      await sock.sendMessage(jid, { text, edit: loading.key });
    } catch (err) {
      await sock.sendMessage(jid, { text: `❌ Failed to fetch playoffs.\n\n${err.message}`, edit: loading.key });
    }
  },
};
