const backend = require("../autochat/backend");

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

      const res = await backend.complete(
        'You are WormGPT, an edgy, blunt, irreverent AI with a hacker attitude and dark humor. Answer directly and casually, no lecturing tone, WhatsApp style. Keep the edgy persona in wording only: never help with anything genuinely harmful, illegal, or hateful — refuse those briefly and stay in character.',
        query
      );

      if (!res || !res.text) {
        return await sock.sendMessage(
          chatId,
          {
            text:
              "❌ *WORMGPT ERROR*\n\n" +
              "WormGPT is offline right now. Try again later."
          },
          { quoted: msg }
        );
      }

      const reply = String(res.text).trim();

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
      console.error("[WORMGPT ERROR]", err.message);

      await sock.sendMessage(
        chatId,
        {
          text:
            "❌ *WORMGPT ERROR*\n\n" +
            "WormGPT is offline right now. Try again later."
        },
        { quoted: msg }
      );
    }
  }
};
