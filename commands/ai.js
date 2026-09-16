/**
 * AI command - flagship CELESTIA feature
 * Uses Gemini (preferred) / OpenAI if keys set — key can live in
 * settingsStore (via .autochat setkey) or env. Otherwise fallback.
 */
const settingsStore = require('../utils/settingsStore');
module.exports = {
  name: 'ai',
  aliases: ['gpt', 'gemini', 'ask'],
  description: 'AI chat (CELESTIA feature)',
  execute: async (sock, msg, args, commands, reply) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply('❌ Usage: .ai <question>\nExample: .ai hello who are you?');

    await reply('🤖 Thinking (CELESTIA AI)...');

    const geminiKey = settingsStore.get('gemini_key', null) || process.env.GEMINI_API_KEY;
    const openaiKey = settingsStore.get('openai_key', null) || process.env.OPENAI_API_KEY;

    // Try Gemini first (flash-latest — pro is retired)
    try {
      if (geminiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
        const result = await model.generateContent(prompt);
        const text = result.response?.text?.();
        if (text && text.trim()) return reply(text.trim().slice(0, 2000));
      }
    } catch (e) {
      console.error('[AI] gemini failed:', e.message);
    }

    // Then OpenAI (4o-mini — 3.5-turbo is retired)
    try {
      if (openaiKey) {
        const { default: OpenAI } = require('openai');
        const client = new OpenAI({ apiKey: openaiKey });
        const res = await client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        });
        const text = res.choices?.[0]?.message?.content;
        if (text && text.trim()) return reply(text.trim().slice(0, 2000));
      }
    } catch (e) {
      console.error('[AI] openai failed:', e.message);
    }

    return reply('🐺 *CELESTIA AI* (no working key): ask the owner to run `.autochat setkey <Gemini-key>`.');
  },
};
