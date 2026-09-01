const axios = require("axios");

const { KEITH_BASE } = require("../config/apis");

const WORMGPT_API =
  "https://apix.wolvarex.com/api/ai/wormgpt";

const WORMGPT_KEY =
  "wxa_f_31d2e67db7";

module.exports = {
  name: "wormgpt",
  description: "Chat with WormGPT AI. Usage: .wormgpt <prompt>",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text:
            "🪱 *WORMGPT AI*\n\n" +
            "Example:\n" +
            ".wormgpt Tell me about black holes"
        },
        { quoted: msg }
      );
    }

    let loading;

    try {
      loading = await sock.sendMessage(
        chatId,
        {
          text: "🪱 WormGPT is thinking..."
        },
        { quoted: msg }
      );

      let reply = null;

      // =========================================================
      // PRIMARY API — WOLVAREX
      // =========================================================
      try {
        console.log("[WORMGPT] Trying Wolvarex API...");

        const { data } = await axios.get(
          WORMGPT_API,
          {
            params: {
              q: query,
              key: WORMGPT_KEY
            },
            timeout: 30000
          }
        );

        console.log("[WORMGPT] Wolvarex response received.");

        if (data) {
          if (typeof data.result === "string") {
            reply = data.result;
          } else if (data.result) {
            reply =
              data.result.response ||
              data.result.answer ||
              data.result.text ||
              null;
          }

          // Some APIs may return the response directly
          if (!reply && typeof data.response === "string") {
            reply = data.response;
          }

          if (!reply && typeof data.answer === "string") {
            reply = data.answer;
          }

          if (!reply && typeof data.text === "string") {
            reply = data.text;
          }
        }

        if (!reply || !reply.trim()) {
          throw new Error("Wolvarex returned an empty response");
        }

      } catch (primaryError) {
        console.error(
          "[WORMGPT] Wolvarex failed:",
          primaryError.message
        );

        // =======================================================
        // FALLBACK — KEITH API
        // =======================================================
        try {
          console.log("[WORMGPT] Switching to Keith fallback...");

          const { data } = await axios.get(
            `${KEITH_BASE}/ai/wormgpt`,
            {
              params: {
                q: query
              },
              timeout: 30000
            }
          );

          if (data) {
            if (typeof data.result === "string") {
              reply = data.result;
            } else if (data.result) {
              reply =
                data.result.response ||
                data.result.answer ||
                data.result.text ||
                null;
            }

            if (!reply && typeof data.response === "string") {
              reply = data.response;
            }

            if (!reply && typeof data.answer === "string") {
              reply = data.answer;
            }

            if (!reply && typeof data.text === "string") {
              reply = data.text;
            }
          }

          if (!reply || !reply.trim()) {
            throw new Error("Keith API returned an empty response");
          }

          console.log("[WORMGPT] Keith fallback successful.");

        } catch (fallbackError) {
          console.error(
            "[WORMGPT] Keith fallback failed:",
            fallbackError.message
          );

          return await sock.sendMessage(
            chatId,
            {
              text:
                "❌ *WORMGPT ERROR*\n\n" +
                "Both WormGPT services are currently unavailable."
            },
            { quoted: msg }
          );
        }
      }

      reply = String(reply).trim();

      // =========================================================
      // SEND RESPONSE
      // =========================================================
      if (reply.length <= 4000) {
        await sock.sendMessage(
          chatId,
          {
            text: `🪱 *WORMGPT AI*\n\n${reply}`,
            edit: loading.key
          }
        );
      } else {
        await sock.sendMessage(
          chatId,
          {
            text:
              `🪱 *WORMGPT AI*\n\n${reply.slice(0, 4000)}`,
            edit: loading.key
          }
        );

        for (let i = 4000; i < reply.length; i += 4000) {
          await sock.sendMessage(chatId, {
            text: reply.slice(i, i + 4000)
          });
        }
      }

    } catch (err) {
      console.error("[WORMGPT ERROR]", err);

      await sock.sendMessage(
        chatId,
        {
          text:
            "❌ *WORMGPT ERROR*\n\n" +
            "Failed to process your request."
        },
        { quoted: msg }
      );
    }
  }
};
