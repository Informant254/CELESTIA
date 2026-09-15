const { ytSearch, ytAudio, cleanName } = require('../utils/downloader');

module.exports = {
  name: "spotify",
  description: "Search and download a track. Usage: .spotify <song name>",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text: "🎵 *CELESTIA SPOTIFY*\n\nExample:\n.spotify Shape of You"
        },
        { quoted: msg }
      );
    }

    if (/open\.spotify\.com/i.test(query)) {
      return await sock.sendMessage(
        chatId,
        { text: "🎵 Send me the *song name* instead (e.g. `.spotify Shape of You`)\nSpotify links can't be resolved directly, but I'll find the track for you." },
        { quoted: msg }
      );
    }

    let statusMsg;

    try {
      statusMsg = await sock.sendMessage(chatId, { text: "🔍 Searching..." }, { quoted: msg });

      const found = await ytSearch(query + ' audio');
      const videoUrl = found.url;
      const videoTitle = found.title;

      await sock.sendMessage(chatId, {
        text: `🎧 Downloading...\n\n*${videoTitle}*`,
        edit: statusMsg.key
      });

      const { url: audioUrl, title } = await ytAudio(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;
      const fileName = cleanName(finalTitle, '.mp3');

      await sock.sendMessage(
        chatId,
        {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          fileName,
          ptt: false
        },
        { quoted: msg }
      );

      await sock.sendMessage(chatId, {
        text: `✅ Successfully downloaded\n\n🎵 *${finalTitle}*`,
        edit: statusMsg.key
      });

    } catch (err) {
      console.error("[SPOTIFY ERROR]", err.message);

      if (statusMsg) {
        await sock.sendMessage(chatId, {
          text: `❌ Download failed.\n\n${err.message}`,
          edit: statusMsg.key
        });
      } else {
        await sock.sendMessage(
          chatId,
          {
            text: `❌ Download failed.\n\n${err.message}`
          },
          { quoted: msg }
        );
      }
    }
  }
};
