const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// eventsnextleague.php returns upcoming fixtures per league id.

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
      const header = "⚽ *UPCOMING MATCHES*";
      return await sock.sendMessage(
        jid,
        {
          text: `${header}\nUsage:\n.standings epl\n.standings bundesliga\n.standings laliga\n.standings seriea\n.standings ligue1\n.standings ucl`,
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
        const header = `${league.emoji} *${league.label}*`;
        return await sock.sendMessage(
          jid,
          {
            text: `${header}\n❌ No upcoming matches found.\nPlease try again later.`,
          },
          { quoted: msg }
        );
      }

      const rows = [];
      for (const m of fixtures.slice(0, 8)) {
        let when = m.strTimestamp || m.dateEvent || "TBA";
        const d = new Date(when);
        if (!isNaN(d)) {
          when =
            d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) +
            " " +
            d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
        }
        const home = String(m.strHomeTeam || "?").slice(0, 15).padEnd(15);
        const away = String(m.strAwayTeam || "?").slice(0, 15).padEnd(15);
        const date = String(when).slice(0, 22).padEnd(22);
        rows.push(`⚽ ${home} vs ${away} 🗓️ ${date}`);
      }

      const header = `${league.emoji} *${league.label} — UPCOMING*`;
      const body = "```\n" + rows.join("\n") + "\n```";
      const footer = `_Upcoming fixtures via free source._`;

      await sock.sendMessage(
        jid,
        { text: `${header}\n${body}\n${footer}` },
        { quoted: msg }
      );
    } catch (err) {
      const header = `${league.emoji} *${league.label}*`;
      await sock.sendMessage(
        jid,
        {
          text: `${header}\n❌ Failed to fetch upcoming matches.\nPlease try again later.`,
        },
        { quoted: msg }
      );
    }
  },
};
