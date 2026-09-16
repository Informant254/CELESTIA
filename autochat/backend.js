/**
 * autochat/backend.js — AI brains. Gemini primary, OpenAI fallback.
 * Key resolution: settingsStore (via .autochat setkey) -> env.
 * Returns reply text or null (never throws to callers).
 */
const settingsStore = require('../utils/settingsStore');

function geminiKey() {
  return settingsStore.get('gemini_key', null) || process.env.GEMINI_API_KEY || null;
}

function openaiKey() {
  return settingsStore.get('openai_key', null) || process.env.OPENAI_API_KEY || null;
}

function hasKey() {
  return !!(geminiKey() || openaiKey());
}

async function gemini(prompt) {
  const key = geminiKey();
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await model.generateContent(prompt);
    const text = result.response?.text?.();
    if (text && text.trim()) return text.trim();
    return null;
  } catch (e) {
    console.error('[autochat] gemini failed:', String(e.message).slice(0, 120));
    return null;
  }
}

async function openai(system, user) {
  const key = openaiKey();
  if (!key) return null;
  try {
    const { default: OpenAI } = require('openai');
    const oa = new OpenAI({ apiKey: key });
    const res = await oa.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 300,
      temperature: 0.9,
    });
    const text = res.choices?.[0]?.message?.content;
    if (text && text.trim()) return text.trim();
    return null;
  } catch (e) {
    console.error('[autochat] openai failed:', String(e.message).slice(0, 120));
    return null;
  }
}

// system+user split for OpenAI, merged for Gemini.
// Patient with transient 503/overload spikes, then OpenAI. Bounded.
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
async function complete(system, user) {
  const prompt = `${system}\n\n---\n\n${user}`;
  let g = await gemini(prompt);
  if (!g) {
    await nap(3000);
    g = await gemini(prompt);
  }
  if (!g) {
    await nap(8000);
    g = await gemini(prompt);
  }
  if (g) return { text: g, engine: 'gemini' };
  const o = await openai(system, user);
  if (o) return { text: o, engine: 'openai' };
  return null;
}

module.exports = { complete, hasKey, geminiKey: () => !!geminiKey() };
