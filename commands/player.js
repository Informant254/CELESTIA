const axios = require("axios");
const ui = require("../utils/ui");

// Free, keyless source (verified live): TheSportsDB free tier.
// searchplayers.php returns player info (verified: Bukayo Saka -> Arsenal).

function ageFrom(dob) {
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

module.exports = {
  name: "playersearch",
  description: "Search for a football player. Usage: .playersearch Bukayo Saka",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return sock.sendMessage(
        chatId,
        {
          text: `${ui.renderSectionTitle("⚽ PLAYER SEARCH")}\n\n• Example:\n• .playersearch Bukayo Saka`,
        },
        { quoted: msg }
      );
    }

    let loading;

    try {
      loading = await sock.sendMessage(
        chatId,
        { text: "🔍 Searching for player..." },
        { quoted: msg }
      );

      const { data } = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(query)}`,
        { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0" } }
      );

      const player = Array.isArray(data?.player) ? data.player[0] : null;

      if (!player) {
        return sock.sendMessage(chatId, {
          text: ui.renderNotice("⚽ PLAYER SEARCH", [`No player found for "${query}".`, "Check the spelling and try again."]),
          edit: loading.key,
        });
      }

      const rows = [];
      if (player.strPlayer) rows.push(ui.renderInfo("👤", "Name", player.strPlayer));
      if (player.strTeam) rows.push(ui.renderInfo("🏟️", "Club", player.strTeam));
      if (player.strNationality) rows.push(ui.renderInfo("🌍", "Nationality", player.strNationality));
      if (player.strPosition) rows.push(ui.renderInfo("🎯", "Position", player.strPosition));
      if (player.dateBorn) {
        const age = ageFrom(player.dateBorn);
        rows.push(ui.renderInfo("🎂", "Born", `${player.dateBorn}${age !== null ? ` (age ${age})` : ""}`));
      }
      if (player.strStatus) rows.push(ui.renderInfo("📋", "Status", player.strStatus));
      if (player.strGender) rows.push(ui.renderInfo("⚧", "Gender", player.strGender));

      const text = rows.length
        ? ui.renderCard("⚽ PLAYER INFORMATION", rows)
        : ui.renderNotice("⚽ PLAYER INFORMATION", ["No details available."]);
      const photo = player.strThumb || player.strCutout;

      if (photo) {
        try {
          await sock.sendMessage(chatId, {
            image: { url: photo },
            caption: text,
          });
          return;
        } catch (e) { /* fall through to text */ }
      }
      await sock.sendMessage(chatId, { text, edit: loading.key });
    } catch (err) {
      await sock.sendMessage(chatId, {
        text: ui.renderNotice("⚽ PLAYER SEARCH", ["Failed to search player.", "Please try again later."]),
        edit: loading?.key,
      });
    }
  },
};
