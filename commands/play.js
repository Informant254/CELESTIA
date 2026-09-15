const { ytSearch, ytAudio, cleanName } = require('../utils/downloader');

module.exports = {
  name: "play",
  description: "Search and download audio from YouTube",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text: "🎵 *CELESTIA PLAY*\n\nExample:\n.play Shape of You"
        },
        { quoted: msg }
      );
    }

    let statusMsg;

    try {
      // Searching...
      statusMsg = await sock.sendMessage(
        chatId,
        {
          text: "🔍 Searching..."
        },
        { quoted: msg }
      );

      let videoUrl;
      let videoTitle;

      // YouTube link
      if (/youtu\.be|youtube\.com/i.test(query)) {
        videoUrl = query;
        try {
          const found = await ytSearch(query);
          videoTitle = found.title || "YouTube Audio";
        } catch {
          videoTitle = "YouTube Audio";
        }
      } else {
        // Search by name
        const found = await ytSearch(query);
        videoUrl = found.url;
        videoTitle = found.title;
      }

      // Downloading...
      await sock.sendMessage(chatId, {
        text: `🎧 Downloading...\n\n*${videoTitle}*`,
        edit: statusMsg.key
      });

      const { url: audioUrl, title } = await ytAudio(videoUrl, videoTitle);
      const finalTitle = title || videoTitle;
      const fileName = cleanName(finalTitle, '.mp3');

      // Playable audio
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

      // Downloadable document
      await sock.sendMessage(
        chatId,
        {
          document: { url: audioUrl },
          mimetype: "audio/mpeg",
          fileName
        },
        { quoted: msg }
      );

      // Success
      await sock.sendMessage(chatId, {
        text: `✅ Successfully downloaded\n\n🎵 *${finalTitle}*`,
        edit: statusMsg.key
      });

    } catch (err) {
      console.error("[PLAY ERROR]", err.message);

      if (statusMsg) {
        await sock.sendMessage(chatId, {
          text: `❌ Failed to play song.\n\n${err.message}`,
          edit: statusMsg.key
        });
      } else {
        await sock.sendMessage(
          chatId,
          {
            text: `❌ Failed to play song.\n\n${err.message}`
          },
          { quoted: msg }
        );
      }
    }
  }
};
