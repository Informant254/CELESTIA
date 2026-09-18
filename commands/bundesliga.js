const axios = require("axios");

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
        const rank = String(i + 1).padStart(2);
        const name = String(t.teamName).slice(0, 18).padEnd(18);
        const p = String(t.matches).padStart(2);
        const gdRaw = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        const gd = gdRaw.padStart(3);
        const pts = String(t.points).padStart(2);
        return `${rank}. ${name} P${p} GD${gd} ${pts}pts`;
      });

      const header = "🇩🇪 *BUNDESLIGA TABLE*";
      const body = "```\n" + rows.join("\n") + "\n```";
      const footer = `_Season ${table.season}/${table.season + 1} — full table via OpenLigaDB._`;

      await sock.sendMessage(jid, {
        text: `${header}\n${body}\n${footer}`,
        edit: loading.key,
      });
    } catch (err) {
      const header = "🇩🇪 *BUNDESLIGA TABLE*";
      await sock.sendMessage(jid, {
        text: `${header}\n❌ Table unavailable right now.\nPlease try again later.`,
        edit: loading.key,
      });
    }
  },
};
