const axios = require("axios");

// Free, keyless source (verified live): OpenLigaDB.
// getgoalgetters/bl1 returns Bundesliga top scorers (e.g. H. Kane 36 goals).
const SEASONS = [2025, 2024, 2026];

const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

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

      const lines = res.rows.slice(0, 10).map((s, i) => {
        const goals = s.goalCount === 1 ? "1 goal" : `${s.goalCount} goals`;
        return `${i + 1}. ${s.goalGetterName} — ${goals}`;
      });
      lines.push("");
      lines.push(`Season ${res.season}/${res.season + 1} via OpenLigaDB.`);

      await sock.sendMessage(jid, {
        text: box("⚽ BUNDESLIGA TOP SCORERS", lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: box("⚽ BUNDESLIGA TOP SCORERS", ["❌ Top scorers unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
