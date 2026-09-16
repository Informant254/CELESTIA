/**
 * AI command - flagship CELESTIA feature.
 * Shared backend: OpenRouter free chain -> Gemini -> OpenAI.
 * Keys via settingsStore (.autochat setkey) or env.
 */
const backend = require('../autochat/backend');
module.exports = {
  name: 'ai',
  aliases: ['gpt', 'gemini', 'ask'],
  description: 'AI chat (CELESTIA feature)',
  execute: async (sock, msg, args, commands, reply) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply('❌ Usage: .ai <question>\nExample: .ai hello who are you?');

    await reply('🤖 Thinking (CELESTIA AI)...');

    try {
      const res = await backend.complete(
        'You are CELESTIA, a sharp, warm WhatsApp AI. Answer briefly (under 150 words), WhatsApp style, no formatting dumps.',
        prompt
      );
      if (res && res.text) return reply(res.text.slice(0, 2000));
    } catch (e) {
      console.error('[AI] backend failed:', e.message);
    }

    return reply('🐺 *CELESTIA AI* (no working key): ask the owner to run `.autochat setkey openrouter <key>`.');
  },
};
