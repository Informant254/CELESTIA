const axios = require('axios');
const settingsStore = require('../utils/settingsStore');

// Video runs on the same Pollinations gateway + key as .imagine.
// Simple endpoint: GET /video/{prompt} returns MP4 (Seedance/Veo).
const GEN_BASE = 'https://gen.pollinations.ai';
const FETCH_TIMEOUT = 300000;
const MAX_PROMPT = 800;

function pollKey() {
  return settingsStore.get('pollinations_key', null) || process.env.POLLINATIONS_KEY || null;
}

function videoModel() {
  return String(settingsStore.get('video_model', null) || process.env.VIDEO_MODEL || 'seedance').trim() || 'seedance';
}

module.exports = {
  name: 'video',
  aliases: ['genvideo', 'clip'],
  description: 'Generate a short AI video clip from a text prompt',

  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const config = require('../config/config');
    const prompt = args.join(' ').trim();

    if (!prompt) {
      return sock.sendMessage(
        jid,
        {
          text: `Usage: ${config.prefix}video <scene description>\n\nExample: ${config.prefix}video a dog driving a vintage car down a coastal road at sunset\n\nShort clips (a few seconds). Video burns Pollen much faster than images — keep prompts tight.\nSetup: same key as images — \`${config.prefix}imagine setkey <key>\` (free at enter.pollinations.ai).`,
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

    await sock.sendMessage(jid, { text: '🎬 Rendering your clip — this takes a few minutes, hang tight...' }, { quoted: msg });

    try {
      const url = `${GEN_BASE}/video/${encodeURIComponent(prompt)}?model=${encodeURIComponent(videoModel())}`;
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT,
        maxContentLength: 64 * 1024 * 1024,
        headers: { Authorization: `Bearer ${pollKey()}` },
        validateStatus: (s) => s === 200,
      });
      const type = String(res.headers?.['content-type'] || '').toLowerCase();
      if (!type.startsWith('video/')) {
        const body = Buffer.from(res.data || []).toString('utf8').slice(0, 160);
        throw Object.assign(new Error(`provider returned non-video: ${body || type || 'unknown'}`), { code: 'BAD_BYTES' });
      }
      if (!res.data || !res.data.length) throw new Error('empty video response');
      const buffer = Buffer.from(res.data);
      if (buffer.length > 16 * 1024 * 1024) {
        throw new Error(`clip is ${(buffer.length / 1048576).toFixed(1)}MB — over WhatsApp's 16MB video limit. Try a simpler scene.`);
      }
      await sock.sendMessage(
        jid,
        { video: buffer, caption: `*Engine:* Pollinations+${videoModel()} 🎬\n*Prompt:* ${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}` },
        { quoted: msg }
      );
    } catch (error) {
      const status = error?.response?.status;
      let detail = '';
      try {
        const data = error?.response?.data;
        detail = String(typeof data === 'string' ? data : data?.error?.message || data?.message || error?.message || '').slice(0, 180);
      } catch { detail = String(error?.message || '').slice(0, 180); }
      console.error('[VIDEO ERROR]', status || error?.code || error?.message);
      let reply;
      if (status === 402 || /insufficient balance|payment required|budget exhausted/i.test(detail)) {
        reply = '❌ Video pool balance exhausted. Top up Pollen at enter.pollinations.ai (video costs far more than images).';
      } else if (status === 401 || status === 403 || /invalid.*api.*key|unauthorized/i.test(detail)) {
        reply = `❌ The stored key was rejected. Send \`${config.prefix}imagine setkey <new-key>\` with a fresh key.`;
      } else if (status === 400 || /content|moderation|blocked|refused|policy|nsfw/i.test(detail)) {
        reply = '❌ The video provider refused that prompt (content filter). Rephrase without sexualized or graphic wording and try again.';
      } else if (error?.code === 'ECONNABORTED' || /timeout/i.test(detail)) {
        reply = '❌ The render timed out (video takes minutes). Try a simpler scene.';
      } else {
        reply = `❌ Video generation failed: ${detail || 'unknown error'}`;
      }
      await sock.sendMessage(jid, { text: reply }, { quoted: msg });
    }
  },
};
