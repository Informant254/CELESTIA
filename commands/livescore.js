const axios = require("axios");

const { KEITH_BASE } = require('../config/apis');
const API = `${KEITH_BASE}/livescore`;

const MAJOR_CATEGORIES = [
  "england", "spain", "italy", "germany", "france", 
  "turkey", "netherlands", "portugal", "saudi arabia", 
  "europe", "world", "international", "usa", "brazil", "argentina"
];

const MAJOR_LEAGUES = [
  "premier league", "championship", "la liga", "laliga", "serie a", 
  "bundesliga", "ligue 1", "super lig", "süper lig", "eredivisie", 
  "primeira liga", "champions league", "europa league", "conference league", 
  "super cup", "copa libertadores", "saudi pro league", "mls", 
  "world cup", "euros", "afcon", "nations league", "fa cup", "copa del rey"
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
      const { data } = await axios.get(API);

      if (!data.status || !data.result || !data.result.games) {
        return sock.sendMessage(
          jid,
          {
            text: "❌ Failed to fetch live scores.",
            edit: loading.key
          }
        );
      }

      const allGames = Object.values(data.result.games);

      if (!allGames.length) {
        return sock.sendMessage(
          jid,
          {
            text: "📭 No matches found.",
            edit: loading.key
          }
        );
      }

      const filteredGames = allGames.filter(game => {
        const country = (game.cn || "").toLowerCase();
        const league = (game.L || game.league || game.sn || "").toLowerCase();
        const fullStr = `${country} ${league}`;

        const isMajorCategory = MAJOR_CATEGORIES.some(cat => country.includes(cat));
        const isExplicitLeague = MAJOR_LEAGUES.some(l => fullStr.includes(l));

        return isExplicitLeague || (isMajorCategory && !league.includes("division") && !league.includes("reserve") && !league.includes("u19") && !league.includes("u21"));
      });

      const gamesToShow = filteredGames.length > 0 ? filteredGames : allGames;
      const isTopMatches = filteredGames.length > 0;

      let text = isTopMatches 
        ? "⚽ *LIVE SCORES (MAJOR LEAGUES)*\n\n" 
        : "⚽ *LIVE SCORES (OTHER MATCHES)*\n\n";

      for (const game of gamesToShow.slice(0, 50)) {
        const status = game.R?.st || "NS";
        const home = game.p1;
        const away = game.p2;
        const score1 = game.R?.r1 ?? "0";
        const score2 = game.R?.r2 ?? "0";

        let emoji = "⏳";

        if (status === "FT") emoji = "✅";
        else if (status === "2T" || status === "1T") emoji = "🔴";

        text += `${emoji} *${home}* ${score1} - ${score2} *${away}*\n`;
        text += `⏱ ${status}\n\n`;
      }

      if (gamesToShow.length > 50) {
        text += `📄 Showing 50 of ${gamesToShow.length} matches.`;
      }

      await sock.sendMessage(jid, {
        text,
        edit: loading.key
      });

    } catch (err) {
      console.error(err);

      await sock.sendMessage(jid, {
        text: "❌ Failed to fetch live scores.",
        edit: loading.key
      });
    }
  }
};
