const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// eventsnextleague.php returns upcoming fixtures per league id.
const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

module.exports = {
  name: "standings",
  aliases: ["fixtures", "matches"],
  description: "Show upcoming football matches",

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    const leagues = {
      epl: { id: "4328", label: "ENGLISH PREMIER LEAGUE", emoji: "🏆" },
      bundesliga: { id: "4331", label: "BUNDESLIGA", emoji: "🇩🇪" },
      laliga: { id: "4335", label: "LA LIGA", emoji: "🇪🇸" },
      seriea: { id: "4332", label: "SERIE A", emoji: "🇮🇹" },
      ligue1: { id: "4334", label: "LIGUE 1", emoji: "🇫🇷" },
      ucl: { id: "4480", label: "CHAMPIONS LEAGUE", emoji: "🏆" },
    };

    if (!args[0] || !leagues[args[0].toLowerCase()]) {
      return await sock.sendMessage(
        jid,
        {
          text: box("⚽ UPCOMING MATCHES", [
            "Usage:",
            ".standings epl",
            ".standings bundesliga",
            ".standings laliga",
            ".standings seriea",
            ".standings ligue1",
            ".standings ucl",
          ]),
        },
        { quoted: msg }
      );
    }

    const league = leagues[args[0].toLowerCase()];

    try {
      const { data } = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${league.id}`,
        { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const fixtures = Array.isArray(data?.events) ? data.events : [];

      if (!fixtures.length) {
        return await sock.sendMessage(
          jid,
          {
            text: box(`${league.emoji} ${league.label}`, [
              "❌ No upcoming matches found.",
              "Please try again later.",
            ]),
          },
          { quoted: msg }
        );
      }

      const lines = [];
      for (const m of fixtures.slice(0, 8)) {
        let when = m.strTimestamp || m.dateEvent || "TBA";
        const d = new Date(when);
        if (!isNaN(d)) {
          when =
            d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
            " " +
            d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
        }
        lines.push(`⚽ *${m.strHomeTeam || "?"}* vs *${m.strAwayTeam || "?"}*`);
        lines.push(`🗓️ ${when}`);
        lines.push("");
      }

      await sock.sendMessage(
        jid,
        { text: box(`${league.emoji} ${league.label} — UPCOMING`, lines) },
        { quoted: msg }
      );
    } catch (err) {
      await sock.sendMessage(
        jid,
        {
          text: box(`${league.emoji} ${league.label}`, [
            "❌ Failed to fetch upcoming matches.",
            "Please try again later.",
          ]),
        },
        { quoted: msg }
      );
    }
  },
};
