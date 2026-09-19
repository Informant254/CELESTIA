const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): TheSportsDB free tier.
// lookuptable returns the current top 5 for league 4332 (Italian Serie A).
const LEAGUE_ID = "4332";
const LEAGUE_EMOJI = "🇮🇹";
const LEAGUE_LABEL = "SERIE A";
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
  name: "seriea",
  description: "Shows the current Serie A standings.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🇮🇹 Fetching Serie A standings..." },
      { quoted: msg }
    );

    try {
      const table = await fetchTable();

      if (!table) {
        throw new Error("Table unavailable right now.");
      }

      const rows = table.rows.map((t) => {
        const gd = Number(t.intGoalDifference) >= 0 ? "+" + t.intGoalDifference : String(t.intGoalDifference);
        return ui.renderStanding(t.intRank, String(t.strTeam), `P${t.intPlayed} · GD ${gd} · ${t.intPoints}pts`);
      });

      await sock.sendMessage(jid, {
        text: `${ui.renderSectionTitle(`${LEAGUE_EMOJI} ${LEAGUE_LABEL}`)}\n\n${rows.join("\n")}\n\n• Season ${table.season} — top ${table.rows.length} shown (free source).`,
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: ui.renderNotice(`${LEAGUE_EMOJI} SERIE A TABLE`, ["Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
