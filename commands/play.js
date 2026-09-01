const axios = require("axios");
const yts = require("yt-search");

const { KEITH_BASE } = require('../config/apis');
const API = KEITH_BASE;

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

        const info = await yts(query);

        if (!info) {
          return await sock.sendMessage(chatId, {
            text: "❌ Invalid YouTube link.",
            edit: statusMsg.key
          });
        }

        videoTitle = info.title || "YouTube Audio";
      } else {
        // Search by name
        const search = await axios.get(
          `${API}/search/yts?query=${encodeURIComponent(query)}`
        );

        const videos = search.data?.result;

        if (!Array.isArray(videos) || videos.length === 0) {
          return await sock.sendMessage(chatId, {
            text: "❌ No results found.",
            edit: statusMsg.key
          });
        }

        videoUrl = videos[0].url;
        videoTitle = videos[0].title;
      }

      // Downloading...
      await sock.sendMessage(chatId, {
        text: `🎧 Downloading...\n\n*${videoTitle}*`,
        edit: statusMsg.key
      });

      const download = await axios.get(
        `${API}/download/audio?url=${encodeURIComponent(videoUrl)}`
      );

      const audioUrl = download.data?.result;

      if (!audioUrl) {
        throw new Error("Failed to retrieve audio.");
      }

      const fileName = `${videoTitle}.mp3`.replace(/[\\/:*?"<>|]/g, "");

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
        text: `✅ Successfully downloaded\n\n🎵 *${videoTitle}*`,
        edit: statusMsg.key
      });

    } catch (err) {
      console.error("[PLAY ERROR]", err);

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
