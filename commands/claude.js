const backend = require('../autochat/backend');

module.exports = {
  name: "claude",
  description: "Chat with Claude AI. Usage: .claude <question>",

  async execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    const query = args.join(" ").trim();

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text: "🤖 *CLAUDE AI*\n\nExample:\n.claude Tell me a joke"
        },
        { quoted: msg }
      );
    }

    let loading;

    try {
      loading = await sock.sendMessage(
        chatId,
        {
          text: "🤖 Claude is thinking..."
        },
        { quoted: msg }
      );

      const res = await backend.complete(
        'You are Claude, a thoughtful, careful and articulate AI assistant. Give clear, well-reasoned, genuinely helpful answers in a calm friendly tone. WhatsApp-friendly formatting, no excessive headers.',
        query
      );

      if (!res || !res.text) {
        return await sock.sendMessage(chatId, {
          text: "❌ Claude AI is offline right now. Please try again later.",
          edit: loading.key
        });
      }

      const reply = res.text.trim();

      // Split long responses
      if (reply.length <= 4000) {
        await sock.sendMessage(chatId, {
          text: `🤖 *CLAUDE AI*\n\n${reply}`,
          edit: loading.key
        });
      } else {
        await sock.sendMessage(chatId, {
          text: `🤖 *CLAUDE AI*\n\n${reply.slice(0, 4000)}`,
          edit: loading.key
        });

        for (let i = 4000; i < reply.length; i += 4000) {
          await sock.sendMessage(chatId, {
            text: reply.slice(i, i + 4000)
          });
        }
      }

    } catch (err) {
      console.error("[CLAUDE ERROR]", err.message);

      await sock.sendMessage(chatId, {
        text: "❌ Claude AI is offline right now. Please try again later.",
        edit: loading?.key
      });
    }
  }
};
