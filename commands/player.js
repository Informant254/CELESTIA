const axios = require("axios");

// Free, keyless source (verified live): TheSportsDB free tier.
// searchplayers.php returns player info (verified: Bukayo Saka -> Arsenal).
const box = (title, lines) =>
  ["> ╭─❏ *" + title + "* ❏", ...lines.map((l) => "> │ " + l), "> ╰─────────────────"].join("\n");

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
          text: box("⚽ PLAYER SEARCH", ["Example:", ".playersearch Bukayo Saka"]),
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
          text: box("⚽ PLAYER SEARCH", [`❌ No player found for "${query}".`, "Check the spelling and try again."]),
          edit: loading.key,
        });
      }

      const lines = [];
      if (player.strPlayer) lines.push(`👤 *Name:* ${player.strPlayer}`);
      if (player.strTeam) lines.push(`🏟️ *Club:* ${player.strTeam}`);
      if (player.strNationality) lines.push(`🌍 *Nationality:* ${player.strNationality}`);
      if (player.strPosition) lines.push(`🎯 *Position:* ${player.strPosition}`);
      if (player.dateBorn) {
        const age = ageFrom(player.dateBorn);
        lines.push(`🎂 *Born:* ${player.dateBorn}${age !== null ? ` (age ${age})` : ""}`);
      }
      if (player.strStatus) lines.push(`📋 *Status:* ${player.strStatus}`);
      if (player.strGender) lines.push(`⚧ *Gender:* ${player.strGender}`);

      const text = box("⚽ PLAYER INFORMATION", lines.length ? lines : ["❌ No details available."]);
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
        text: box("⚽ PLAYER SEARCH", ["❌ Failed to search player.", "Please try again later."]),
        edit: loading?.key,
      });
    }
  },
};
