const axios = require("axios");

// Free, keyless source (verified live): OpenLigaDB.
// getgoalgetters/bl1 returns Bundesliga top scorers (e.g. H. Kane 36 goals).
const SEASONS = [2025, 2024, 2026];

async function fetchScorers() {
  for (const season of SEASONS) {
    try {
      const { data } = await axios.get(
        `https://api.openligadb.de/getgoalgetters/bl1/${season}`,
        { timeout: 20000 }
      );
      if (Array.isArray(data) && data.length) {
        return { rows: data, season };
      }
    } catch (e) { /* try next season */ }
  }
  return null;
}

module.exports = {
  name: "bundesligascorers",
  description: "Shows the current Bundesliga top scorers.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Bundesliga top scorers..." },
      { quoted: msg }
    );

    try {
      const res = await fetchScorers();

      if (!res) {
        throw new Error("Scorers unavailable right now.");
      }

      const rows = res.rows.slice(0, 10).map((s, i) => {
        const rank = String(i + 1).padStart(2);
        const name = String(s.goalGetterName).slice(0, 20).padEnd(20);
        const goalsText = (s.goalCount === 1 ? "1 goal" : `${s.goalCount} goals`).padEnd(8);
        return `${rank}. ${name} — ${goalsText}`;
      });

      const header = "⚽ *BUNDESLIGA TOP SCORERS*";
      const body = "```\n" + rows.join("\n") + "\n```";
      const footer = `_Season ${res.season}/${res.season + 1} via OpenLigaDB._`;

      await sock.sendMessage(jid, {
        text: `${header}\n${body}\n${footer}`,
        edit: loading.key,
      });
    } catch (err) {
      const header = "⚽ *BUNDESLIGA TOP SCORERS*";
      await sock.sendMessage(jid, {
        text: `${header}\n❌ Top scorers unavailable right now.\nPlease try again later.`,
        edit: loading.key,
      });
    }
  },
};
