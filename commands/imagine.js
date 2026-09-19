const axios = require('axios');
const settingsStore = require('../utils/settingsStore');

// Pollinations killed anonymous image generation (HTTP 402 "Insufficient
// balance"). Generation now goes through their OpenAI-compatible gateway,
// which needs a free key from enter.pollinations.ai (free Pollen via Quests).
const GEN_BASE = 'https://gen.pollinations.ai';
const LEGACY_BASE = 'https://image.pollinations.ai';

// Old GET endpoint caps URL length; keep prompts bounded there.
const MAX_PROMPT = 1500;
const FETCH_TIMEOUT = 180000;

function pollKey() {
  return settingsStore.get('pollinations_key', null) || process.env.POLLINATIONS_KEY || null;
}

function imageModel() {
  return String(settingsStore.get('imagine_model', null) || process.env.IMAGINE_MODEL || 'flux').trim() || 'flux';
}

function openaiSize(width, height) {
  if (width > height) return '1792x1024';
  if (height > width) return '1024x1792';
  return '1024x1024';
}

// Primary: OpenAI-compatible gateway (authenticated).
async function viaGateway(prompt, size) {
  const key = pollKey();
  if (!key) {
    throw Object.assign(new Error('no pollinations key configured'), { code: 'NO_KEY' });
  }
  const res = await axios.post(
    `${GEN_BASE}/v1/images/generations`,
    { model: imageModel(), prompt, size, n: 1, response_format: 'b64_json' },
    {
      timeout: FETCH_TIMEOUT,
      maxContentLength: 30 * 1024 * 1024,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      validateStatus: (s) => s === 200,
    }
  );
  const item = res.data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const dl = await axios.get(item.url, { responseType: 'arraybuffer', timeout: FETCH_TIMEOUT, maxContentLength: 30 * 1024 * 1024 });
    const type = String(dl.headers?.['content-type'] || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error('gateway returned non-image url');
    return Buffer.from(dl.data);
  }
  throw new Error(`gateway returned no image: ${JSON.stringify(res.data).slice(0, 160)}`);
}

// Fallback: legacy GET endpoint (works only while it still serves the caller).
async function viaLegacy(prompt, model, width, height, seed, enhance) {
  const key = pollKey();
  const url = `${LEGACY_BASE}/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance ? 'true' : 'false'}`;
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT,
    maxContentLength: 25 * 1024 * 1024,
    ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}),
    validateStatus: (s) => s === 200,
  });
  const type = String(res.headers?.['content-type'] || '').toLowerCase();
  if (!type.startsWith('image/')) {
    const body = Buffer.from(res.data || []).toString('utf8').slice(0, 160);
    throw Object.assign(new Error(`provider returned non-image: ${body || type || 'unknown'}`), { code: 'BAD_BYTES' });
  }
  if (!res.data || !res.data.length) throw Object.assign(new Error('empty image response'), { code: 'BAD_BYTES' });
  return Buffer.from(res.data);
}

function failureReply(error) {
  const status = error?.response?.status;
  let detail = '';
  try {
    const data = error?.response?.data;
    detail = String(typeof data === 'string' ? data : data?.error?.message || data?.message || error?.message || '').slice(0, 180);
  } catch { detail = String(error?.message || '').slice(0, 180); }
  if (error?.code === 'NO_KEY' || status === 402 || /insufficient balance|payment required|budget exhausted|queue full/i.test(detail)) {
    return '❌ The free image pool is exhausted (provider now needs an account).\n\nFix (free, 2 min):\n1. Register at enter.pollinations.ai and grab an API key (free Pollen from Quests).\n2. Send `.imagine setkey <your-key>` here.\n3. Re-run your prompt.';
  }
  if (status === 401 || status === 403 || /invalid.*api.*key|unauthorized/i.test(detail)) {
    return '❌ The stored image key was rejected. Send `.imagine setkey <new-key>` with a fresh key from enter.pollinations.ai.';
  }
  if (status === 400 || status === 422 || status === 451 || /content|moderation|blocked|refused|policy|nsfw/i.test(detail)) {
    return '❌ The image provider refused that prompt (content filter). Rephrase it — describe the scene, style and mood without sexualized or graphic wording — and try again.';
  }
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(detail)) {
    return '❌ The image run timed out. Try again, or add --turbo for a faster render.';
  }
  if (error?.code === 'BAD_BYTES') {
    return `❌ The provider returned an error instead of an image: ${detail || 'unknown error'}`;
  }
  if (status === 429) return '❌ Rate-limited by the image provider. Wait a few seconds and retry.';
  return `❌ Image generation failed: ${detail || 'unknown error'}`;
}

module.exports = {
  name: 'imagine',
  aliases: ['createimage', 'dalle'],
  description: 'Generate AI image (dalle/imagine)',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    let prompt = args.join(' ').trim();

    if (!prompt) {
      return await sock.sendMessage(
        jid,
        {
          text: `Usage: ${config.prefix}imagine <full scene description>\n\nDescribe everything — subject, action, setting, lighting, style, mood. The whole prompt is sent to the model.\n\nFlags:\n  --wide   → landscape\n  --tall   → portrait\n  --turbo  → faster render (legacy pool)\n  --seed <n> → repeat an exact result\n  --noenhance → verbatim prompt (legacy pool)\n\nSetup (one time, free):\n  ${config.prefix}imagine setkey <key>  → key from enter.pollinations.ai`,
        },
        { quoted: msg }
      );
    }

    // One-time free key setup from the bot owner.
    if (/^setkey\s+\S+/i.test(prompt)) {
      const key = prompt.replace(/^setkey\s+/i, '').trim();
      if (key.length < 8) return sock.sendMessage(jid, { text: '❌ That key looks too short. Paste the full key after `.imagine setkey`.' }, { quoted: msg });
      settingsStore.set('pollinations_key', key);
      return sock.sendMessage(jid, { text: '✅ Image key stored. Try your prompt again with `.imagine <description>`.' }, { quoted: msg });
    }

    let width = 1024;
    let height = 1024;
    let legacyModel = 'flux';
    let seed = Math.floor(Math.random() * 999999);
    let enhance = true;
    const take = (flag) => {
      if (prompt.includes(flag)) {
        prompt = prompt.replace(flag, '').replace(/\s+/g, ' ').trim();
        return true;
      }
      return false;
    };
    if (take('--wide')) { width = 1024; height = 576; }
    if (take('--tall')) { width = 576; height = 1024; }
    if (take('--turbo')) legacyModel = 'turbo';
    if (take('--noenhance')) enhance = false;
    const seedMatch = prompt.match(/--seed\s+(\d{1,9})/);
    if (seedMatch) {
      seed = parseInt(seedMatch[1], 10);
      prompt = prompt.replace(seedMatch[0], '').replace(/\s+/g, ' ').trim();
    }

    let trimmed = false;
    if (prompt.length > MAX_PROMPT) {
      prompt = prompt.slice(0, MAX_PROMPT).trim();
      trimmed = true;
    }
    if (!prompt) {
      return sock.sendMessage(jid, { text: '❌ Give me a description first — what should the image show?' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: '🎨 Generating your image, please wait...' }, { quoted: msg });

    // Authenticated gateway first; legacy pool as fallback.
    const attempts = [
      { name: `Pollinations+${imageModel()} 🖌️`, run: () => viaGateway(prompt, openaiSize(width, height)) },
      { name: legacyModel === 'turbo' ? 'Flux Turbo ⚡' : 'Flux ✨', run: () => viaLegacy(prompt, legacyModel, width, height, seed, enhance) },
    ];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const buffer = await attempt.run();
        const lines = [
          `*Engine:* ${attempt.name}`,
          `*Size:* ${width}×${height}px`,
          `*Seed:* ${seed} (reuse with --seed ${seed})`,
          `*Prompt${enhance ? ' (AI-enhanced)' : ''}:* ${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}`,
        ];
        if (trimmed) lines.push('_Note: prompt trimmed to 1500 chars for transport._');
        await sock.sendMessage(jid, { image: buffer, caption: lines.join('\n') }, { quoted: msg });
        return;
      } catch (error) {
        lastError = error;
        console.error('[IMAGINE ERROR]', attempt.name, error?.response?.status || error?.code || error?.message);
        const reply = failureReply(error);
        // Key/balance and content refusals won't pass on the next engine — report now.
        if (/account|key was rejected|refused that prompt/.test(reply)) break;
      }
    }
    await sock.sendMessage(jid, { text: failureReply(lastError) }, { quoted: msg });
  },
};
