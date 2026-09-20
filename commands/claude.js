const backend = require('../autochat/backend');
const modes = require('../autochat/modes');
const functions = require('../autochat/functions');
const { policyBlock } = require('../autochat/refusalPolicy');

module.exports = {
  name: "claude",
  description: "Chat with Claude AI. Usage: .claude <question> | .claude on|off",

  async execute(sock, msg, args, commands) {
    const chatId = msg.key.remoteJid;
    const sub = String(args[0] || '').toLowerCase();

    // Continuous conversation mode — same flow as autochat.
    if (sub === 'on' || sub === 'off') {
      if (sub === 'on') {
        modes.enable(chatId, 'claude');
        return await sock.sendMessage(chatId, {
          text: '🤖 *CLAUDE AI is live in this chat.*\nJust talk — every message gets a Claude reply. She can also run functions (ask for an image, sticker, clip, or voice readout).\n\n`.claude off` to end the session. `.claude <question>` still works anywhere as a one-shot.'
        }, { quoted: msg });
      }
      const had = modes.disable(chatId);
      return await sock.sendMessage(chatId, {
        text: had ? '🤖 Claude session ended — back to normal.' : '🤖 No Claude session was running here.'
      }, { quoted: msg });
    }

    const query = args.join(" ").trim();

    if (!query) {
      const on = modes.active(chatId) === 'claude';
      return await sock.sendMessage(
        chatId,
        {
          text: `🤖 *CLAUDE AI* (session ${on ? 'ON' : 'OFF'})\n\nOne-shot: .claude Tell me a joke\nContinuous: .claude on | .claude off`
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
        [
          'You are Claude, a thoughtful, careful and articulate AI assistant. Give clear, well-reasoned, genuinely helpful answers in a calm friendly tone. WhatsApp-friendly formatting, no excessive headers.',
          policyBlock(),
          functions.toolBlock(),
        ].join('\n\n'),
        query
      );

      if (!res || !res.text) {
        return await sock.sendMessage(chatId, {
          text: "❌ Claude AI is offline right now. Please try again later.",
          edit: loading.key
        });
      }

      let reply = res.text.trim();
      try {
        const fx = functions.extract(reply);
        if (fx.func && commands) {
          await functions.run(sock, msg, commands, fx.func, fx.arg);
          reply = fx.clean;
        }
      } catch (e) {
        console.error('[CLAUDE FUNC]', String(e.message).slice(0, 100));
      }
      if (!reply) return;

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
