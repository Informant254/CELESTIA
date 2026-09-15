const { ytSearch, ytAudio, cleanName } = require('../utils/downloader');

module.exports = {
  name: "audio",
  description: "Search and download audio from YouTube. Usage: .audio <song name or link>",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text: "🎵 *CELESTIA AUDIO*\n\nExample:\n.audio Shape of You"
        },
        { quoted: msg }
      );
    }

    let statusMsg;

    try {
      // Send one status message
      statusMsg = await sock.sendMessage(
        chatId,
        {
          text: "🔍 Searching..."
        },
        { quoted: msg }
      );

      let videoUrl;
      let videoTitle;

      // User sent a YouTube link
      if (/youtu\.be|youtube\.com/i.test(query)) {
        videoUrl = query;
        try {
          const found = await ytSearch(query);
          videoTitle = found.title || "YouTube Audio";
        } catch {
          videoTitle = "YouTube Audio";
        }
      } else {
        // Search by song name
        const found = await ytSearch(query);
        videoUrl = found.url;
        videoTitle = found.title;
      }

      // Edit to downloading
      await sock.sendMessage(chatId, {
        text: `🎧 Downloading...\n\n*${videoTitle}*`,
        edit: statusMsg.key
      });

      const { url: audioUrl, title } = await ytAudio(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;
      const fileName = cleanName(finalTitle, '.mp3');

      // Send audio
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

      // Edit to success
      await sock.sendMessage(chatId, {
        text: `✅ Successfully downloaded\n\n🎵 *${finalTitle}*`,
        edit: statusMsg.key
      });

    } catch (err) {
      console.error("[AUDIO ERROR]", err.message);

      if (statusMsg) {
        await sock.sendMessage(chatId, {
          text: `❌ Audio download failed.\n\n${err.message}`,
          edit: statusMsg.key
        });
      } else {
        await sock.sendMessage(
          chatId,
          {
            text: `❌ Audio download failed.\n\n${err.message}`
          },
          { quoted: msg }
        );
      }
    }
  }
};
