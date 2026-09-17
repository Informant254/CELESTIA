/**
 * utils/aiRelay.js — CELESTIA AI relay (API gateway for friend deploys).
 *
 * The owner's real Apix key NEVER leaves this server. Friend instances set:
 *   APIX_BASE=https://<owner-public-base>   (this server's public URL)
 *   APIX_KEY=<their personal token>          (issued via .aitoken, NOT the real key)
 * and their bot's existing apix() client works unchanged (same path, same
 * header, same {status, result} shape).
 *
 * Safety: per-token issue/revoke, hourly per-token rate cap, model allowlist,
 * only the `q` param is forwarded, upstream errors are sanitized, and the
 * real key is never logged, returned, or echoed.
 */
const axios = require('axios');
const crypto = require('crypto');
const settingsStore = require('./settingsStore');

// Fixed upstream — deliberately NOT env-overridable (prevents relay loops).
const REAL_APIX_BASE = 'https://apix.wolvarex.com';

// Chat-capable models exposed through the relay.
const ALLOWED_MODELS = new Set([
  'gemini', 'gpt', 'claude', 'mistral', 'deepseek', 'llama', 'qwen',
  'groq', 'cohere', 'mixtral', 'phi', 'falcon', 'vicuna', 'openchat',
  'wizard', 'zephyr', 'nous', 'openhermes', 'neural', 'solar', 'yi',
  'orca', 'command', 'nemotron', 'internlm', 'chatglm', 'tinyllama',
]);

const TOKENS_KEY = 'air_tokens';   // { token: { label, createdTs } }
const USAGE_KEY = 'air_usage';     // { token: { windowStart, count } }

function hourlyCap() {
  const v = parseInt(process.env.RELAY_RPH || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 120;
}

function realKey() {
  return process.env.APIX_KEY || settingsStore.get('apix_key', null) || null;
}

function relayEnabled() {
  if (String(process.env.AI_RELAY || '').toLowerCase() === 'off') return false;
  return !!realKey();
}

// ─── tokens ───
function listTokens() {
  const t = settingsStore.get(TOKENS_KEY, {});
  return t && typeof t === 'object' ? t : {};
}

function issueToken(label) {
  const clean = String(label || '').trim().slice(0, 32) || 'friend';
  const token = 'celestia_' + crypto.randomBytes(16).toString('hex');
  const all = listTokens();
  all[token] = { label: clean, createdTs: Date.now() };
  settingsStore.set(TOKENS_KEY, all);
  return token;
}

function revokeToken(labelOrToken) {
  const all = listTokens();
  const q = String(labelOrToken || '').trim();
  let dropped = 0;
  for (const [tok, meta] of Object.entries(all)) {
    if (tok === q || meta.label === q) {
      delete all[tok];
      dropped += 1;
    }
  }
  if (dropped) settingsStore.set(TOKENS_KEY, all);
  return dropped;
}

function verifyToken(token) {
  if (!token) return null;
  const meta = listTokens()[token];
  return meta || null;
}

// ─── rate limit (hourly window per token) ───
function checkRate(token) {
  const cap = hourlyCap();
  const now = Date.now();
  const usage = settingsStore.get(USAGE_KEY, {}) || {};
  const slot = usage[token];
  if (!slot || now - slot.windowStart >= 3600000) {
    usage[token] = { windowStart: now, count: 1 };
    settingsStore.set(USAGE_KEY, usage);
    return { ok: true, remaining: cap - 1 };
  }
  if (slot.count >= cap) return { ok: false, remaining: 0 };
  slot.count += 1;
  settingsStore.set(USAGE_KEY, usage);
  return { ok: true, remaining: cap - slot.count };
}

function usageSnapshot() {
  return settingsStore.get(USAGE_KEY, {}) || {};
}

// ─── express handler: GET /api/ai/:model?q=... (x-api-key: <token>) ───
async function handleRelay(req, res) {
  const model = String(req.params?.model || '').toLowerCase();
  if (!relayEnabled()) {
    return res.status(503).json({ status: false, error: 'AI relay not configured on this server.' });
  }
  if (!ALLOWED_MODELS.has(model)) {
    return res.status(400).json({ status: false, error: 'Model not exposed through this relay.' });
  }
  const token = req.headers?.['x-api-key'] || req.query?.key || null;
  const meta = verifyToken(token);
  if (!meta) {
    return res.status(401).json({ status: false, error: 'Invalid relay token. Ask the server owner for one.' });
  }
  const rate = checkRate(token);
  if (!rate.ok) {
    return res.status(429).json({ status: false, error: 'Hourly relay quota exhausted. Try again later.' });
  }
  const q = String(req.query?.q ?? '').slice(0, 1500);
  if (!q.trim()) {
    return res.status(400).json({ status: false, error: 'Missing q parameter.' });
  }
  try {
    const r = await axios.get(`${REAL_APIX_BASE}/api/ai/${model}`, {
      params: { q },
      timeout: 60000,
      headers: { 'x-api-key': realKey() },
    });
    const text = r.data?.result;
    if (r.data?.status && text && String(text).trim()) {
      console.log(`[airelay] ${meta.label} :: ${model} :: ok (${rate.remaining} left)`);
      return res.json({ status: true, result: String(text), provider: 'CELESTIA', powered_by: 'ApixRelay' });
    }
    throw new Error('Upstream returned no usable result.');
  } catch (e) {
    const detail = e.response?.status ? `Upstream HTTP ${e.response.status}` : 'Upstream unreachable';
    console.error(`[airelay] ${meta.label} :: ${model} :: fail (${detail})`);
    return res.status(502).json({ status: false, error: 'AI provider failed. Try again.' });
  }
}

module.exports = {
  handleRelay, issueToken, revokeToken, listTokens, verifyToken,
  checkRate, usageSnapshot, relayEnabled, hourlyCap, ALLOWED_MODELS,
};
