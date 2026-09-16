/**
 * autochat/backend.js — AI brains. Gemini primary, OpenAI fallback.
 * Key resolution: settingsStore (via .autochat setkey) -> env.
 * Returns reply text or null (never throws to callers).
 */
const settingsStore = require('../utils/settingsStore');

function geminiKey() {
  return settingsStore.get('gemini_key', null) || process.env.GEMINI_API_KEY || null;
}

function openrouterKey() {
  return settingsStore.get('openrouter_key', null) || process.env.OPENROUTER_API_KEY || null;
}

function openaiKey() {
  return settingsStore.get('openai_key', null) || process.env.OPENAI_API_KEY || null;
}

function hasKey() {
  return !!(openrouterKey() || geminiKey() || openaiKey());
}

// Free models, verified live (primary first). Free tiers throttle —
// chain order matters, first success wins.
const OR_MODELS = [
  'z-ai/glm-5.2:free',
  'nex-agi/nex-n2.5-pro:free',
  'google/gemma-4-31b-it:free',
];

async function openrouter(system, user) {
  const key = openrouterKey();
  if (!key) return null;
  let axios;
  try {
    axios = require('axios');
  } catch {
    return null;
  }
  for (const model of OR_MODELS) {
    try {
      const r = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: 300,
          temperature: 0.9,
        },
        {
          timeout: 45000,
          headers: {
            Authorization: `Bearer ${key}`,
            'HTTP-Referer': 'https://celestia-bot',
            'X-Title': 'CELESTIA',
          },
        }
      );
      const text = r.data?.choices?.[0]?.message?.content;
      if (text && text.trim()) return { text: text.trim(), engine: `openrouter/${model.split('/')[1]}` };
    } catch (e) {
      const detail = e.response?.data?.error?.message || e.message;
      console.error('[autochat] openrouter failed', model, String(detail).slice(0, 100));
    }
  }
  return null;
}

async function gemini(prompt) {
  const key = geminiKey();
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('gemini timeout')), 60000)),
    ]);
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
// Order: OpenRouter free chain -> Gemini -> OpenAI. Patient with 503s.
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
async function complete(system, user) {
  const or = await openrouter(system, user);
  if (or) return or;
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
  // On-server model: free, always awake, dumber — the safety net.
  try {
    const local = require('./local');
    const text = await local.generate(system, user);
    if (text) return { text, engine: 'local/llama-3.2-1b' };
  } catch (e) {
    console.error('[autochat] local failed:', String(e.message).slice(0, 100));
  }
  const o = await openai(system, user);
  if (o) return { text: o, engine: 'openai' };
  return null;
}

module.exports = { complete, hasKey, geminiKey: () => !!geminiKey(), openrouterKey: () => !!openrouterKey() };
