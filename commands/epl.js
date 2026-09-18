const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// lookuptable returns the current top 5 for league 4328 (English Premier League).
const LEAGUE_ID = "4328";
const LEAGUE_LABEL = "ENGLISH PREMIER LEAGUE";
const SEASONS = ["2026-2027", "2025-2026", "2024-2025"];

const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

async function fetchTable() {
  for (const season of SEASONS) {
    try {
      const { data } = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${LEAGUE_ID}&s=${season}`,
        { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } }
      );
      if (data && Array.isArray(data.table) && data.table.length) {
        return { rows: data.table, season };
      }
    } catch (e) { /* try next season */ }
  }
  return null;
}

module.exports = {
  name: "epl",
  description: "Shows the current English Premier League standings.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching Premier League standings..." },
      { quoted: msg }
    );

    try {
      const table = await fetchTable();

      if (!table) {
        throw new Error("Table unavailable right now.");
      }

      const lines = table.rows.map((t) => {
        const rank = String(t.intRank).padStart(2);
        const name = String(t.strTeam).slice(0, 18).padEnd(18);
        const p = String(t.intPlayed).padStart(2);
        const gd = Number(t.intGoalDifference) >= 0 ? "+" + t.intGoalDifference : String(t.intGoalDifference);
        return `${rank}. ${name} P${p} GD${gd} ${t.intPoints}pts`;
      });
      lines.push("");
      lines.push(`Season ${table.season} — top ${table.rows.length} shown (free source).`);

      await sock.sendMessage(jid, {
        text: box(`🏆 ${LEAGUE_LABEL} TABLE`, lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: box("🏆 EPL TABLE", ["❌ Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
