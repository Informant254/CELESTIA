const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): TheSportsDB free tier.
// searchteams.php returns team info (verified: Arsenal -> Emirates Stadium).

module.exports = {
  name: "teamsearch",
  description: "Search for a football team. Usage: .teamsearch Arsenal",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return sock.sendMessage(
        chatId,
        {
          text: `${ui.renderSectionTitle("⚽ TEAM SEARCH")}\n\n• Example:\n• .teamsearch Arsenal`,
        },
        { quoted: msg }
      );
    }

    let loading;

    try {
      loading = await sock.sendMessage(
        chatId,
        { text: "🔍 Searching for team..." },
        { quoted: msg }
      );

      const { data } = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(query)}`,
        { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const team = Array.isArray(data?.teams) ? data.teams[0] : null;

      if (!team) {
        return sock.sendMessage(chatId, {
          text: ui.renderNotice("⚽ TEAM SEARCH", [`No team found for "${query}".`, "Check the spelling and try again."]),
          edit: loading.key,
        });
      }

      const rows = [];
      if (team.strTeam) rows.push(ui.renderInfo("🏟️", "Name", team.strTeam));
      if (team.strTeamShort) rows.push(ui.renderInfo("🪧", "Short", team.strTeamShort));
      if (team.strCountry) rows.push(ui.renderInfo("🌍", "Country", team.strCountry));
      if (team.strLeague) rows.push(ui.renderInfo("🏆", "League", team.strLeague));
      if (team.intFormedYear) rows.push(ui.renderInfo("📅", "Founded", team.intFormedYear));
      if (team.strStadium) rows.push(ui.renderInfo("🏟️", "Stadium", team.strStadium));
      if (team.intStadiumCapacity) rows.push(ui.renderInfo("👥", "Capacity", team.intStadiumCapacity));
      if (team.strWebsite) rows.push(ui.renderInfo("🌐", "Website", team.strWebsite));

      const text = rows.length
        ? ui.renderCard("⚽ TEAM INFORMATION", rows)
        : ui.renderNotice("⚽ TEAM INFORMATION", ["No details available."]);
      const badge = team.strBadge || team.strLogo;

      if (badge) {
        try {
          await sock.sendMessage(chatId, {
            image: { url: badge },
            caption: text,
          });
          return;
        } catch (e) { /* fall through to text */ }
      }
      await sock.sendMessage(chatId, { text, edit: loading.key });
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: ui.renderNotice("⚽ TEAM SEARCH", ["Failed to search team.", "Please try again later."]),
        edit: loading?.key,
      });
    }
  },
};
