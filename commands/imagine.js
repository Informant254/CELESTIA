const axios = require('axios');

// Pollinations image API is GET-only with the prompt in the URL path, so a
// very long prompt can break transport before the model ever sees it. Cap it
// high enough for real descriptive prompts, and say so when trimming.
const MAX_PROMPT = 1500;
const FETCH_TIMEOUT = 120000;

async function fetchImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: FETCH_TIMEOUT,
    maxContentLength: 25 * 1024 * 1024,
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
  const detail = String(error?.response?.data || error?.message || '').slice(0, 160);
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
          text: `Usage Example: ${config.prefix}imagine beautiful anime girl in a forest\n\nDescribe the full scene — subject, action, setting, lighting, style, mood. The whole prompt is sent to the model.\n\nFlags:\n  --wide   → landscape (1024×576)\n  --tall   → portrait (576×1024)\n  --turbo  → faster Flux Turbo render\n  --seed <n> → repeat an exact result\n  --noenhance → send your words verbatim (default: AI prompt enhancement ON)\n\nDefault: square 1024×1024, Flux ✨`,
        },
        { quoted: msg }
      );
    }

    let width = 1024;
    let height = 1024;
    let model = 'flux';
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
    if (take('--turbo')) model = 'turbo';
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

    const buildUrl = (m) =>
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${m}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=${enhance ? 'true' : 'false'}`;

    const attempts = model === 'turbo' ? ['turbo', 'flux'] : ['flux', 'turbo'];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const buffer = await fetchImage(buildUrl(attempt));
        const label = attempt === 'turbo' ? 'Flux Turbo ⚡' : 'Flux ✨';
        const lines = [
          `*Model:* ${label}`,
          `*Size:* ${width}×${height}px`,
          `*Seed:* ${seed} (reuse with --seed ${seed})`,
          `*Prompt${enhance ? ' (AI-enhanced)' : ''}:* ${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}`,
        ];
        if (trimmed) lines.push('_Note: prompt trimmed to 1500 chars for transport._');
        await sock.sendMessage(jid, { image: buffer, caption: lines.join('\n') }, { quoted: msg });
        return;
      } catch (error) {
        lastError = error;
        console.error('[IMAGINE ERROR]', attempt, error?.response?.status || error?.code || error?.message);
        // Content refusals won't pass on retry with another model — report now.
        if (failureReply(error).includes('refused that prompt')) break;
      }
    }
    await sock.sendMessage(jid, { text: failureReply(lastError) }, { quoted: msg });
  },
};
