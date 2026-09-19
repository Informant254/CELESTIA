const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): OpenLigaDB.
// getbltable/bl1 returns the full Bundesliga standings (18 teams).
const SEASONS = [2026, 2025, 2024];

async function fetchTable() {
  for (const season of SEASONS) {
    try {
      const { data } = await axios.get(
        `https://api.openligadb.de/getbltable/bl1/${season}`,
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
  name: "bundesliga",
  description: "Shows the current Bundesliga standings.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🇩🇪 Fetching Bundesliga standings..." },
      { quoted: msg }
    );

    try {
      const table = await fetchTable();

      if (!table) {
        throw new Error("Table unavailable right now.");
      }

      const rows = table.rows.map((t, i) => {
        const gd = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        return ui.renderStanding(i + 1, String(t.teamName), `P${t.matches} · GD ${gd} · ${t.points}pts`);
      });

      await sock.sendMessage(jid, {
        text: `${ui.renderSectionTitle("🇩🇪 BUNDESLIGA")}\n\n${rows.join("\n")}\n\n• Season ${table.season}/${table.season + 1} — full table via OpenLigaDB.`,
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: ui.renderNotice("🇩🇪 BUNDESLIGA TABLE", ["Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
