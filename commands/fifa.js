const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): OpenLigaDB.
// getbltable/wm2026/2026 returns the World Cup 2026 group-stage table.

module.exports = {
  name: "fifa",
  description: "Shows current FIFA World Cup standings/groups.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "🏆 Fetching FIFA standings..." },
      { quoted: msg }
    );

    try {
      const { data } = await axios.get(
        "https://api.openligadb.de/getbltable/wm2026/2026",
        { timeout: 20000 }
      );

      if (!Array.isArray(data) || !data.length) {
        throw new Error("Table unavailable right now.");
      }

      const sorted = [...data].sort(
        (a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goals - a.goals
      );

      const rows = sorted.slice(0, 12).map((t, i) => {
        const gd = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        return ui.renderStanding(i + 1, String(t.teamName), `P${t.matches} · GD ${gd} · ${t.points}pts`);
      });

      await sock.sendMessage(jid, {
        text: `${ui.renderSectionTitle("🏆 FIFA WORLD CUP")}\n\n${rows.join("\n")}\n\n• World Cup 2026 (USA) — group stage, top 12.\n• Source: OpenLigaDB.`,
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: ui.renderNotice("🏆 FIFA WORLD CUP TABLE", ["Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
