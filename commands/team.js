const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// searchteams.php returns team info (verified: Arsenal -> Emirates Stadium).
const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

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
          text: box("⚽ TEAM SEARCH", ["Example:", ".teamsearch Arsenal"]),
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
          text: box("⚽ TEAM SEARCH", [`❌ No team found for "${query}".`, "Check the spelling and try again."]),
          edit: loading.key,
        });
      }

      const lines = [];
      if (team.strTeam) lines.push(`🏟️ *Name:* ${team.strTeam}`);
      if (team.strTeamShort) lines.push(`🪧 *Short:* ${team.strTeamShort}`);
      if (team.strCountry) lines.push(`🌍 *Country:* ${team.strCountry}`);
      if (team.strLeague) lines.push(`🏆 *League:* ${team.strLeague}`);
      if (team.intFormedYear) lines.push(`📅 *Founded:* ${team.intFormedYear}`);
      if (team.strStadium) lines.push(`🏟️ *Stadium:* ${team.strStadium}`);
      if (team.intStadiumCapacity) lines.push(`👥 *Capacity:* ${team.intStadiumCapacity}`);
      if (team.strWebsite) lines.push(`🌐 *Website:* ${team.strWebsite}`);

      const text = box("⚽ TEAM INFORMATION", lines.length ? lines : ["❌ No details available."]);
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
        text: box("⚽ TEAM SEARCH", ["❌ Failed to search team.", "Please try again later."]),
        edit: loading?.key,
      });
    }
  },
};
