const axios = require("axios");

// Free, keyless source (verified live): OpenLigaDB.
// getbltable/wm2026/2026 returns the World Cup 2026 group-stage table.
const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

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

      const lines = sorted.slice(0, 12).map((t, i) => {
        const name = String(t.teamName).slice(0, 16).padEnd(16);
        const gd = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        return `${String(i + 1).padStart(2)}. ${name} P${t.matches} GD${gd} ${t.points}pts`;
      });
      lines.push("");
      lines.push("World Cup 2026 (USA) — group stage, top 12.");
      lines.push("Source: OpenLigaDB.");

      await sock.sendMessage(jid, {
        text: box("🏆 FIFA WORLD CUP TABLE", lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: box("🏆 FIFA WORLD CUP TABLE", ["❌ Table unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
