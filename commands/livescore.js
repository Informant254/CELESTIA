const axios = require("axios");
const {
  renderMatchCard,
  renderNotice,
} = require("../utils/celestiaUi");

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
          text: renderNotice(
            "📭",
            "LIVE SCORES",
            "No matches were found."
          ),
          edit: loading.key,
        });
      }

      const major = games.filter((g) =>
        MAJOR.some((m) => String(g.strLeague || "").toLowerCase().includes(m))
      );
      const list = (major.length ? major : games).slice(0, 15);

      const cards = list.map((game) =>
        renderMatchCard({
          status: game.strStatus || "NS",
          home: game.strHomeTeam,
          away: game.strAwayTeam,
          homeScore: game.intHomeScore ?? "0",
          awayScore: game.intAwayScore ?? "0",
          league: game.strLeague || "",
          country: game.strCountry || "",
        })
      );

      const count = list.length;
      const header = [
        "╭─ ⚽ *CELESTIA LIVE*",
        `│ ${major.length ? "Major competitions" : "Live matches"}`,
        `│ ${count} match${count === 1 ? "" : "es"} shown`,
        "╰────────────────────────",
      ].join("\n");

      const scopeNote = major.length ? "Showing major-league matches." : "Showing live matches.";
      const countNote = games.length > 15 ? ` Showing 15 of ${games.length} live matches.` : "";

      await sock.sendMessage(jid, {
        text: `${header}\n\n${cards.join("\n\n")}\n\n📄 _${scopeNote}${countNote}_`,
        edit: loading.key,
      });
    } catch (err) {
      console.error(err);

      await sock.sendMessage(jid, {
        text: renderNotice(
          "⚠️",
          "LIVE SCORES",
          "Could not fetch live scores right now."
        ),
        edit: loading.key,
      });
    }
  },
};
