const axios = require("axios");

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
        const rank = String(i + 1).padStart(2);
        const name = String(t.teamName).slice(0, 16).padEnd(16);
        const p = String(t.matches).padStart(2);
        const gdRaw = Number(t.goalDiff) >= 0 ? "+" + t.goalDiff : String(t.goalDiff);
        const gd = gdRaw.padStart(3);
        const pts = String(t.points).padStart(2);
        return `${rank}. ${name} P${p} GD${gd} ${pts}pts`;
      });

      const header = "🏆 *FIFA WORLD CUP TABLE*";
      const body = "```\n" + rows.join("\n") + "\n```";
      const footer = "_World Cup 2026 (USA) — group stage, top 12._\n_Source: OpenLigaDB._";

      await sock.sendMessage(jid, {
        text: `${header}\n${body}\n${footer}`,
        edit: loading.key,
      });
    } catch (err) {
      const header = "🏆 *FIFA WORLD CUP TABLE*";
      await sock.sendMessage(jid, {
        text: `${header}\n❌ Table unavailable right now.\nPlease try again later.`,
        edit: loading.key,
      });
    }
  },
};
