const backend = require("../autochat/backend");
const modes = require("../autochat/modes");
const functions = require("../autochat/functions");
const { policyBlock } = require("../autochat/refusalPolicy");

module.exports = {
  name: "wormgpt",
  description: "Chat with WormGPT AI. Usage: .wormgpt <prompt> | .wormgpt on|off",

  async execute(sock, msg, args, commands) {
    const chatId = msg.key.remoteJid;
    const sub = String(args[0] || "").toLowerCase();

    // Continuous conversation mode — same flow as autochat.
    if (sub === "on" || sub === "off") {
      if (sub === "on") {
        modes.enable(chatId, "wormgpt");
        return await sock.sendMessage(chatId, {
          text: "🪱 *WORMGPT is live in this chat.*\nTalk freely — every message gets a WormGPT reply, and it can run functions (ask for an image, sticker, clip, or voice readout).\n\n`.wormgpt off` to end the session. `.wormgpt <prompt>` still works anywhere as a one-shot."
        }, { quoted: msg });
      }
      const had = modes.disable(chatId);
      return await sock.sendMessage(chatId, {
        text: had ? "🪱 WormGPT session ended — back to normal." : "🪱 No WormGPT session was running here."
      }, { quoted: msg });
    }

    const query = args.join(" ").trim();

    if (!query) {
      const on = modes.active(chatId) === "wormgpt";
      return await sock.sendMessage(
        chatId,
        {
          text:
            `🪱 *WORMGPT AI* (session ${on ? "ON" : "OFF"})\n\n` +
            "One-shot: .wormgpt Tell me about black holes\n" +
            "Continuous: .wormgpt on | .wormgpt off"
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
        [
          'You are WormGPT, an edgy, blunt, irreverent AI with a hacker attitude and dark humor. Answer directly and casually, no lecturing tone, WhatsApp style. Keep the edgy persona in wording only: never help with anything genuinely harmful, illegal, or hateful — refuse those briefly and stay in character.',
          policyBlock(),
          functions.toolBlock(),
        ].join('\n\n'),
        query
      );

      if (!res || !res.text || !String(res.text).trim()) {
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

      let reply = String(res.text).trim();
      try {
        const fx = functions.extract(reply);
        if (fx.func && commands) {
          await functions.run(sock, msg, commands, fx.func, fx.arg);
          reply = fx.clean;
        }
      } catch (e) {
        console.error('[WORMGPT FUNC]', String(e.message).slice(0, 100));
      }
      if (!reply) return;

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
