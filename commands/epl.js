const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// lookuptable returns the current top 5 for league 4328 (English Premier League).
const LEAGUE_ID = "4328";
const LEAGUE_LABEL = "ENGLISH PREMIER LEAGUE";
const SEASONS = ["2026-2027", "2025-2026", "2024-2025"];

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

      const rows = table.rows.map((t) => {
        const rank = String(t.intRank).padStart(2);
        const name = String(t.strTeam).slice(0, 18).padEnd(18);
        const p = String(t.intPlayed).padStart(2);
        const gdRaw = Number(t.intGoalDifference) >= 0 ? "+" + t.intGoalDifference : String(t.intGoalDifference);
        const gd = gdRaw.padStart(3);
        const pts = String(t.intPoints).padStart(2);
        return `${rank}. ${name} P${p} GD${gd} ${pts}pts`;
      });

      const header = `🏆 *${LEAGUE_LABEL} TABLE*`;
      const body = "```\n" + rows.join("\n") + "\n```";
      const footer = `_Season ${table.season} — top ${table.rows.length} shown (free source)._`;

      await sock.sendMessage(jid, {
        text: `${header}\n${body}\n${footer}`,
        edit: loading.key,
      });
    } catch (err) {
      const header = "🏆 *EPL TABLE*";
      await sock.sendMessage(jid, {
        text: `${header}\n❌ Table unavailable right now.\nPlease try again later.`,
        edit: loading.key,
      });
    }
  },
};
