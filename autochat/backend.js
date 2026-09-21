/**
 * autochat/backend.js — AI brains. Gemini primary, OpenAI fallback.
 * Key resolution: settingsStore (via .autochat setkey) -> env.
 * Returns reply text or null (never throws to callers).
 */
const settingsStore = require('../utils/settingsStore');
const AUTH_FAILURE = Symbol('auth failure');

function isAuthFailure(error) {
  const status = error?.status || error?.response?.status;
  const detail = String(error?.response?.data?.error?.message || error?.message || '');
  return status === 401 || status === 403 || /\b(?:401|403|unauthorized|forbidden|invalid api key|authentication)\b/i.test(detail);
}

function geminiKey() {
  return settingsStore.get('gemini_key', null) || process.env.GEMINI_API_KEY || null;
}

function openrouterKey() {
  return settingsStore.get('openrouter_key', null) || process.env.OPENROUTER_API_KEY || null;
}

function openzenKey() {
  return settingsStore.get('openzen_key', null) || process.env.OPENZEN_API_KEY || process.env.OPENCODE_API_KEY || null;
}

function apixKey() {
  return settingsStore.get('apix_key', null) || process.env.APIX_KEY || null;
}

function openaiKey() {
  return settingsStore.get('openai_key', null) || process.env.OPENAI_API_KEY || null;
}

function hasKey() {
  let localEnabled = false;
  try { localEnabled = require('./local').status().enabled; } catch {}
  return !!(codexStatus().authenticated || apixKey() || openzenKey() || openrouterKey() || geminiKey() || openaiKey() || localEnabled);
}

function codexStatus() {
  try {
    return require('./codex').status();
  } catch {
    return { authenticated: false, mode: null };
  }
}

// Apix (Wolvarex hub, unlimited premium): GET /api/ai/{model}?q=...
// Models in voice order. Single text query, so the persona ships compressed.
const APIX_BASE = process.env.APIX_BASE || 'https://apix.wolvarex.com';
const APIX_MODELS = ['gemini', 'gpt', 'claude'];

async function apix(system, user) {
  const key = apixKey();
  if (!key) return null;
  let axios;
  try {
    axios = require('axios');
  } catch {
    return null;
  }
  // Single text query: compress the persona (voice samples, tone, rules)
  // ahead of the message so teaching actually reaches the model.
  const compact = String(system || '').replace(/\s+/g, ' ').trim().slice(0, 2050);
  const current = String(user || '').slice(-1400);
  const q = `${compact}\n\n${current}`;
  for (const model of APIX_MODELS) {
    try {
      const r = await axios.get(`${APIX_BASE}/api/ai/${model}`, {
        params: { q },
        timeout: 60000,
        headers: { 'x-api-key': key },
      });
      const text = r.data?.result;
      if (r.data?.status && text && String(text).trim()) {
        return { text: String(text).trim(), engine: `apix/${model}` };
      }
    } catch (e) {
      console.error('[autochat] apix failed', model, String(e.response?.data?.error?.message || e.message).slice(0, 100));
      if (isAuthFailure(e)) break;
    }
  }
  return null;
}
const OR_MODELS = [
  'z-ai/glm-5.2:free',
  'nex-agi/nex-n2.5-pro:free',
  'google/gemma-4-31b-it:free',
];

// OpenCode Zen gateway — OpenAI-compatible, hosts genuinely free models.
// Key resolution: settingsStore (.autochat setkey openzen) -> env.
const ZEN_BASE = process.env.OPENZEN_BASE || 'https://opencode.ai/zen/v1';
const ZEN_MODELS = [
  'deepseek-v4-flash-free',
  'qwen3.6-plus-free',
  'minimax-m3-free',
];

async function openzen(system, user) {
  const key = openzenKey();
  if (!key) return null;
  let axios;
  try {
    axios = require('axios');
  } catch {
    return null;
  }
  for (const model of ZEN_MODELS) {
    try {
      const r = await axios.post(
        `${ZEN_BASE}/chat/completions`,
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
          headers: { Authorization: `Bearer ${key}` },
        }
      );
      const text = r.data?.choices?.[0]?.message?.content;
      if (text && text.trim()) return { text: text.trim(), engine: `openzen/${model}` };
    } catch (e) {
      const detail = e.response?.data?.error?.message || e.message;
      console.error('[autochat] openzen failed', model, String(detail).slice(0, 100));
      if (isAuthFailure(e)) break;
    }
  }
  return null;
}

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
      if (isAuthFailure(e)) break;
    }
  }
  return null;
}

async function gemini(prompt) {
  const key = geminiKey();
  if (!key) return null;
  let timer;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('gemini timeout')), 60000); }),
    ]);
    const text = result.response?.text?.();
    if (text && text.trim()) return text.trim();
    return null;
  } catch (e) {
    console.error('[autochat] gemini failed:', String(e.message).slice(0, 120));
    return isAuthFailure(e) ? AUTH_FAILURE : null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function openaiModel() {
  const m = String(settingsStore.get('openai_model', null) || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  return m || 'gpt-4o-mini';
}

async function openai(system, user) {
  const key = openaiKey();
  if (!key) return null;
  try {
    const { default: OpenAI } = require('openai');
    const oa = new OpenAI({ apiKey: key, timeout: 60000 });
    const res = await oa.chat.completions.create({
      model: openaiModel(),
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

// ChatGPT subscription is preferred when authenticated; key-based providers
// remain fallbacks when its quota, login, or single-worker slot is unavailable.
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
async function complete(system, user) {
  if (codexStatus().authenticated) {
    try {
      const text = await require('./codex').generate(system, user);
      if (text) return { text, engine: `codex/${require('./codex').model()}` };
    } catch (e) {
      console.error('[autochat] codex unavailable:', String(e.message).slice(0, 100));
    }
  }
  const ax = await apix(system, user);
  if (ax) return ax;
  const zen = await openzen(system, user);
  if (zen) return zen;
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
  if (g === AUTH_FAILURE) g = null;
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

module.exports = { complete, hasKey, codexStatus, geminiKey: () => !!geminiKey(), openrouterKey: () => !!openrouterKey(), openzenKey: () => !!openzenKey(), apixKey: () => !!apixKey(), openaiKey: () => !!openaiKey(), openaiModel, openai };
