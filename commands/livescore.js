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
        const header = "⚽ *LIVE SCORES*";
        return sock.sendMessage(jid, {
          text: `${header}\n📭 No live matches right now.\nCheck back later.`,
          edit: loading.key,
        });
      }

      const major = games.filter((g) =>
        MAJOR.some((m) => String(g.strLeague || "").toLowerCase().includes(m))
      );
      const list = (major.length ? major : games).slice(0, 15);

      const rows = list.map((g) => {
        const emoji = statusEmoji(g.strStatus);
        const home = String(g.strHomeTeam || "?").slice(0, 15).padEnd(15);
        const away = String(g.strAwayTeam || "?").slice(0, 15).padEnd(15);
        const hs = String(g.intHomeScore ?? "?").padStart(2);
        const as = String(g.intAwayScore ?? "?").padStart(2);
        const status = String(g.strStatus || "LIVE").slice(0, 8).padEnd(8);
        const league = String(g.strLeague || "Soccer").slice(0, 18).padEnd(18);
        return `${emoji} ${home} ${hs}-${as} ${away} ⏱ ${status} ${league}`;
      });

      const header = "⚽ *LIVE SCORES*";
      const body = "```\n" + rows.join("\n") + "\n```";
      const scopeNote = major.length ? "Showing major-league matches." : "Showing live matches.";
      const countNote = games.length > 15 ? ` Showing 15 of ${games.length} live matches.` : "";
      const footer = `_${scopeNote}${countNote}_`;

      await sock.sendMessage(jid, {
        text: `${header}\n${body}\n${footer}`,
        edit: loading.key,
      });
    } catch (err) {
      const header = "⚽ *LIVE SCORES*";
      await sock.sendMessage(jid, {
        text: `${header}\n❌ Live scores unavailable right now.\nPlease try again later.`,
        edit: loading.key,
      });
    }
  },
};
