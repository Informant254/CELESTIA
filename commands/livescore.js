const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): TheSportsDB free tier.
// livescore.php?s=Soccer returns currently-live soccer matches.
const MAJOR = [
  "premier league", "la liga", "serie a", "bundesliga", "ligue 1",
  "champions league", "europa league", "conference league", "fa cup",
  "copa del rey", "coppa italia", "dfb-pokal", "eredivisie",
  "primeira liga", "saudi", "mls", "major league soccer",
  "world cup", "euro", "nations league", "afcon",
];

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
          text: ui.renderNotice("⚽ LIVE SCORES", [
            "No live matches right now.",
            "Check back later.",
          ]),
          edit: loading.key,
        });
      }

      const major = games.filter((g) =>
        MAJOR.some((m) => String(g.strLeague || "").toLowerCase().includes(m))
      );
      const list = (major.length ? major : games).slice(0, 15);

      const cards = list.map((g) =>
        ui.renderMatch({
          home: g.strHomeTeam,
          away: g.strAwayTeam,
          homeScore: g.intHomeScore,
          awayScore: g.intAwayScore,
          status: g.strStatus,
          league: g.strLeague,
        })
      );

      const scopeNote = major.length ? "Showing major-league matches." : "Showing live matches.";
      const countNote = games.length > 15 ? ` Showing 15 of ${games.length} live matches.` : "";

      await sock.sendMessage(jid, {
        text: `${ui.renderSectionTitle("⚽ LIVE SCORES")}\n\n${cards.join("\n\n")}\n\n• ${scopeNote}${countNote}`,
        edit: loading.key,
      });
    } catch (err) {
      await sock.sendMessage(jid, {
        text: ui.renderNotice("⚽ LIVE SCORES", [
          "Live scores unavailable right now.",
          "Please try again later.",
        ]),
        edit: loading.key,
      });
    }
  },
};
