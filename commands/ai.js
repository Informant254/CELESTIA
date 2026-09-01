/**
 * AI command - CELESTIA feature ported to merged bot
 * Uses OpenAI / Gemini if API keys set, otherwise fallback
 */
const config = require('../config/config');
module.exports = {
  name: 'ai',
  aliases: ['gpt', 'gemini', 'ask'],
  description: 'AI chat (CELESTIA feature)',
  execute: async (sock, msg, args, commands, reply) => {
    const prompt = args.join(' ').trim();
    if (!prompt) return reply('❌ Usage: .ai <question>\nExample: .ai hello who are you?');

    await reply('🤖 Thinking (merged CELESTIA AI)...');

    // Try OpenAI if key exists
    try {
      if (process.env.OPENAI_API_KEY) {
        const OpenAI = require('openai');
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const res = await client.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        });
        return reply(res.choices[0].message.content);
      }
      if (process.env.GEMINI_API_KEY) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        return reply(result.response.text());
      }
      // No API key - fallback echo with merged branding
      return reply(`🐺 *MERGED AI* (no API key set):\nYou asked: "${prompt}"\n\nSet OPENAI_API_KEY or GEMINI_API_KEY in .env to enable real AI (CELESTIA feature).`);
    } catch (e) {
      return reply(`❌ AI error: ${e.message}`);
    }
  }
};
