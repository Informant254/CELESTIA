const axios = require('axios');
const settingsStore = require('../utils/settingsStore');

// Video runs on the same Pollinations gateway + key as .imagine.
// Simple endpoint: GET /video/{prompt} returns MP4 (Seedance/Veo).
const GEN_BASE = 'https://gen.pollinations.ai';
const FETCH_TIMEOUT = 300000;
const MAX_PROMPT = 800;
const OPEN_FALLBACK = 'alibaba/wan-2.2-fast';

function pollKey() {
  return settingsStore.get('pollinations_key', null) || process.env.POLLINATIONS_KEY || null;
}

function videoModel() {
  return String(settingsStore.get('video_model', null) || process.env.VIDEO_MODEL || OPEN_FALLBACK).trim() || OPEN_FALLBACK;
}

function errorDetail(error) {
  try {
    let data = error?.response?.data;
    if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) data = Buffer.from(data).toString('utf8');
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return data.slice(0, 240); }
    }
    return String(data?.error?.message || data?.message || error?.message || '').slice(0, 240);
  } catch {
    return String(error?.message || '').slice(0, 240);
  }
}

function canFallback(error, detail) {
  const status = error?.response?.status;
  return [404, 429, 500, 502, 503, 504].includes(status) ||
    ([400, 422].includes(status) && /model|engine|provider|route|available|support|invalid/i.test(detail)) ||
    error?.code === 'BAD_BYTES';
}

async function render(prompt, engine, key) {
  const url = `${GEN_BASE}/video/${encodeURIComponent(prompt)}?model=${encodeURIComponent(engine)}`;
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT,
    maxContentLength: 64 * 1024 * 1024,
    headers: { Authorization: `Bearer ${key}` },
    validateStatus: (s) => s === 200,
  });
  const type = String(res.headers?.['content-type'] || '').toLowerCase();
  if (!type.startsWith('video/')) {
    const body = Buffer.from(res.data || []).toString('utf8').slice(0, 240);
    throw Object.assign(new Error(`provider returned non-video: ${body || type || 'unknown'}`), { code: 'BAD_BYTES' });
  }
  if (!res.data || !res.data.length) throw new Error('empty video response');
  return Buffer.from(res.data);
}

module.exports = {
  name: 'video',
  aliases: ['genvideo', 'clip'],
  description: 'Generate a short AI video clip from a text prompt',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    let prompt = args.join(' ').trim();

    if (!prompt) {
      return sock.sendMessage(
        jid,
        {
          text: `Usage: ${config.prefix}video <scene description> [--model <id>]\n\nExample: ${config.prefix}video a dog driving a vintage car down a coastal road at sunset\n\nShort clips (a few seconds). Video burns Pollen much faster than images — keep prompts tight.\nReliable open-model default: ${OPEN_FALLBACK}\nOther engines: minimax/minimax-h3-max-turbo, bytedance/seedance-2.0-fast, bytedance/seedance-2.5, alibaba/wan-3.0\nExample: ${config.prefix}video ocean waves at dawn --model ${OPEN_FALLBACK}\nSetup: same key as images — \`${config.prefix}imagine setkey <key>\` (free at enter.pollinations.ai).`,
        },
        { quoted: msg }
      );
    }
    if (!pollKey()) {
      return sock.sendMessage(
        jid,
        { text: `❌ No image/video key stored yet.\n\n1. Register at enter.pollinations.ai and grab an API key.\n2. Send \`${config.prefix}imagine setkey <your-key>\` here.\n3. Re-run your prompt.` },
        { quoted: msg }
      );
    }
    if (prompt.length > MAX_PROMPT) {
      return sock.sendMessage(jid, { text: '❌ Keep the scene under 800 characters — short clips need tight prompts.' }, { quoted: msg });
    }

    let engine = videoModel();
    const modelMatch = prompt.match(/--model\s+([A-Za-z0-9._/-]{1,64})/);
    if (modelMatch) {
      engine = modelMatch[1];
      prompt = prompt.replace(modelMatch[0], '').replace(/\s+/g, ' ').trim();
    }
    if (!prompt) {
      return sock.sendMessage(jid, { text: '❌ Give me a scene first — what should the clip show?' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `🎬 Rendering with *${engine}* — this takes a few minutes, hang tight...` }, { quoted: msg });

    try {
      let buffer;
      try {
        buffer = await render(prompt, engine, pollKey());
      } catch (firstError) {
        const detail = errorDetail(firstError);
        if (engine === OPEN_FALLBACK || !canFallback(firstError, detail)) throw firstError;
        console.warn(`[VIDEO] ${engine} unavailable; falling back to ${OPEN_FALLBACK}: ${detail}`);
        engine = OPEN_FALLBACK;
        buffer = await render(prompt, engine, pollKey());
      }
      if (buffer.length > 16 * 1024 * 1024) {
        throw new Error(`clip is ${(buffer.length / 1048576).toFixed(1)}MB — over WhatsApp's 16MB video limit. Try a simpler scene.`);
      }
      await sock.sendMessage(
        jid,
        { video: buffer, caption: `*Engine:* Pollinations+${engine} 🎬\n*Prompt:* ${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}` },
        { quoted: msg }
      );
    } catch (error) {
      const status = error?.response?.status;
      const detail = errorDetail(error);
      console.error('[VIDEO ERROR]', status || error?.code || error?.message);
      let reply;
      if (status === 402 || /insufficient balance|payment required|budget exhausted/i.test(detail)) {
        reply = '❌ Video pool balance exhausted. Top up Pollen at enter.pollinations.ai (video costs far more than images).';
      } else if (status === 401 || status === 403 || /invalid.*api.*key|unauthorized/i.test(detail)) {
        reply = `❌ The stored key was rejected. Send \`${config.prefix}imagine setkey <new-key>\` with a fresh key.`;
      } else if (/moderation|safety filter|content policy|blocked.*prompt|nsfw|sexual|graphic violence/i.test(detail)) {
        reply = '❌ The video provider refused that prompt (content filter). Rephrase without sexualized or graphic wording and try again.';
      } else if ([400, 404, 422].includes(status) && /model|engine|provider|route|available|support|invalid/i.test(detail)) {
        reply = `❌ That video engine is unavailable. Try the reliable open model: \`${OPEN_FALLBACK}\`.`;
      } else if (status === 429) {
        reply = '❌ The video service is busy or rate-limited. Wait a minute and try again.';
      } else if ([500, 502, 503, 504].includes(status)) {
        reply = '❌ The video provider is temporarily unavailable. Try again shortly.';
      } else if (error?.code === 'ECONNABORTED' || /timeout/i.test(detail)) {
        reply = '❌ The render timed out (video takes minutes). Try a simpler scene.';
      } else {
        reply = `❌ Video generation failed: ${detail || 'unknown error'}`;
      }
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  },
};
