const axios = require("axios");

// Free, keyless source (verified live): OpenLigaDB.
// getbltable/bl1 returns the full Bundesliga standings (18 teams).
const SEASONS = [2026, 2025, 2024];

const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

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

      const lines = table.rows.map((t, i) => {
        const rank = String(i + 1).padStart(2);
        const name = String(t.teamName).slice(0, 18).padEnd(18);
        const p = String(t.matches).padStart(2);
        const gd = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        return `${rank}. ${name} P${p} GD${gd} ${t.points}pts`;
      });
      lines.push("");
      lines.push(`Season ${table.season}/${table.season + 1} — full table via OpenLigaDB.`);

      await sock.sendMessage(jid, {
        text: box("🇩🇪 BUNDESLIGA TABLE", lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: box("🇩🇪 BUNDESLIGA TABLE", ["❌ Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
