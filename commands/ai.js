/**
 * AI command - flagship CELESTIA feature.
 * Shared backend: OpenRouter free chain -> Gemini -> OpenAI.
 * Keys via settingsStore (.autochat setkey) or env.
 */
const backend = require('../autochat/backend');
const modes = require('../autochat/modes');
const functions = require('../autochat/functions');
const { policyBlock } = require('../autochat/refusalPolicy');
module.exports = {
  name: 'ai',
  aliases: ['gpt', 'gemini', 'ask'],
  description: 'AI chat (CELESTIA feature)',
  execute: async (sock, msg, args, commands, reply) => {
    const chatId = msg.key.remoteJid;
    const sub = String(args[0] || '').toLowerCase();

    // Continuous conversation mode — same flow as autochat.
    if (sub === 'on' || sub === 'off') {
      if (sub === 'on') {
        modes.enable(chatId, 'gpt');
        return reply('✦ *CELESTIA AI is live in this chat.*\nJust talk — every message gets an answer, and it can run functions (ask for an image, sticker, clip, or voice readout).\n\n`.ai off` to end the session. `.ai <question>` still works anywhere as a one-shot.');
      }
      const had = modes.disable(chatId);
      return reply(had ? '✦ AI session ended — back to normal.' : '✦ No AI session was running here.');
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
      const on = modes.active(chatId) === 'gpt';
      return reply(`❌ Usage: .ai <question>\nExample: .ai hello who are you?\n\nContinuous: .ai on | .ai off (session ${on ? 'ON' : 'OFF'})`);
    }

    await reply('🤖 Thinking (CELESTIA AI)...');

    try {
      const res = await backend.complete(
        [
          'You are CELESTIA, a sharp, warm WhatsApp AI. Answer briefly (under 150 words), WhatsApp style, no formatting dumps.',
          policyBlock(),
          functions.toolBlock(),
        ].join('\n\n'),
        prompt
      );
      if (res && res.text) {
        let text = res.text.slice(0, 2000);
        try {
          const fx = functions.extract(text);
          if (fx.func && commands) {
            await functions.run(sock, msg, commands, fx.func, fx.arg);
            text = fx.clean;
          }
        } catch (e) {
          console.error('[AI FUNC]', e.message);
        }
        if (text) return reply(text);
        return;
      }
    } catch (e) {
      console.error('[AI] backend failed:', e.message);
    }

    return reply('🐺 *CELESTIA AI* (no working key): ask the owner to run `.autochat setkey openrouter <key>`.');
  },
};
