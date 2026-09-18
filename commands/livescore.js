const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// livescore.php?s=Soccer returns currently-live soccer matches.
const MAJOR = [
  "premier league", "la liga", "serie a", "bundesliga", "ligue 1",
  "champions league", "europa league", "conference league", "fa cup",
  "copa del rey", "coppa italia", "dfb-pokal", "eredivisie",
  "primeira liga", "saudi", "mls", "major league soccer",
  "world cup", "euro", "nations league", "afcon",
];

const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

function statusEmoji(s) {
  const st = String(s || "").toUpperCase();
  if (st === "FT" || st.includes("FINISH") || st.includes("FULL")) return "✅";
  if (st === "HT") return "⏸️";
  if (st === "NS" || st === "" || st.includes("SCHED")) return "⏳";
  return "🔴";
}

module.exports = {
  name: "livescore",
  description: "Shows current football live scores for top leagues with general fallback.",

  async execute(sock, msg) {
    const jid = msg.key.remoteJid;

    const loading = await sock.sendMessage(
      jid,
      { text: "⚽ Fetching live matches..." },
      { quoted: msg }
    );

    try {
      const { data } = await axios.get(
        "https://www.thesportsdb.com/api/v1/json/3/livescore.php?s=Soccer",
        { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const games = Array.isArray(data?.livescore) ? data.livescore : [];

      if (!games.length) {
        return sock.sendMessage(jid, {
          text: box("⚽ LIVE SCORES", ["📭 No live matches right now.", "Check back later."]),
          edit: loading.key,
        });
      }

      const major = games.filter((g) =>
        MAJOR.some((m) => String(g.strLeague || "").toLowerCase().includes(m))
      );
      const list = (major.length ? major : games).slice(0, 15);

      const lines = [];
      lines.push(major.length ? "Showing major-league matches:" : "Showing live matches:");
      lines.push("");
      for (const g of list) {
        const emoji = statusEmoji(g.strStatus);
        lines.push(`${emoji} *${g.strHomeTeam}* ${g.intHomeScore ?? "?"} - ${g.intAwayScore ?? "?"} *${g.strAwayTeam}*`);
        lines.push(`⏱ ${g.strStatus || "LIVE"} — ${g.strLeague || "Soccer"}`);
        lines.push("");
      }
      if (games.length > 15) lines.push(`Showing 15 of ${games.length} live matches.`);

      await sock.sendMessage(jid, {
        text: box("⚽ LIVE SCORES", lines),
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: box("⚽ LIVE SCORES", ["❌ Live scores unavailable right now.", "Please try again later."]),
        edit: loading.key,
      });
    }
  },
};
