const axios = require('axios');
const FormData = require('form-data');
const studio = require('./mediaStudio');

const MAX_INPUT = 20 * 1024 * 1024;
const MAX_STICKER = 1024 * 1024;

function assertImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) throw new Error('Image is empty or invalid');
  if (buffer.length > MAX_INPUT) throw new Error('Image exceeds the 20MB processing limit');
}

async function normalize(input, removeWhite = false) {
  assertImage(input);
  const sharp = require('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  let image = sharp(input, { failOn: 'error', limitInputPixels: 40000000 }).rotate().ensureAlpha().resize(480, 480, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  if (removeWhite) {
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const low = Math.min(data[i], data[i + 1], data[i + 2]);
      if (low > 235) data[i + 3] = Math.max(0, 255 - (low - 235) * 13);
    }
    image = sharp(data, { raw: info });
  }
  return image.extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
}

async function toSticker(input, { pack = 'CELESTIA', author = 'CELESTIA', categories = ['✨'], removeWhite = false } = {}) {
  const png = await normalize(input, removeWhite);
  void pack; void author; void categories;
  const sharp = require('sharp');
  const make = (quality) => sharp(png).webp({ quality, alphaQuality: 90, effort: 5 }).toBuffer();
  let output = await make(88);
  if (output.length > MAX_STICKER) output = await make(62);
  if (!output.length || output.length > MAX_STICKER) throw new Error('Sticker exceeds WhatsApp 1MB limit');
  return output;
}

async function aiArt(prompt) {
  const clean = String(prompt || '').trim().slice(0, 700);
  if (!clean) throw new Error('A sticker description is required');
  return studio.generateImage(`${clean}, single centered cute sticker illustration, isolated subject, bold clean silhouette, thick dark outline, plain pure white background, no shadows, no frame, no words, no letters, no logo, no watermark, square composition`);
}

async function textArt(text, colors = ['#8b5cf6', '#22d3ee']) {
  const sharp = require('sharp');
  const safe = studio.escapeXml(String(text || '').slice(0, 32));
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="${colors[0]}"/><stop offset="1" stop-color="${colors[1]}"/></linearGradient></defs><rect x="20" y="75" width="472" height="362" rx="105" fill="url(#g)"/><rect x="31" y="86" width="450" height="340" rx="94" fill="none" stroke="#fff" stroke-width="9" opacity=".8"/><text x="256" y="275" text-anchor="middle" dominant-baseline="middle" fill="#fff" stroke="#130b2e" stroke-width="7" paint-order="stroke" font-family="sans-serif" font-size="${safe.length > 16 ? 42 : 58}" font-weight="900">${safe}</text><circle cx="90" cy="105" r="10" fill="#fff"/><circle cx="430" cy="405" r="8" fill="#fff"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function removeBackground(input) {
  assertImage(input);
  const form = new FormData();
  form.append('image_file', input, { filename: 'photo.jpg', contentType: 'image/jpeg', knownLength: input.length });
  form.append('turnstile_token', '');
  const created = await axios.post('https://api.ezremove.ai/api/ez-remove/background-remove/create-job-v2', form, { headers: { 'product-serial': '07cc2e862644a6a1860194a9f6a6f70f', ...form.getHeaders() }, timeout: 30000, maxBodyLength: MAX_INPUT + 1048576 });
  const id = created.data?.result?.job_id;
  if (!id) throw new Error('Background service created no job');
  let url;
  for (let i = 0; i < 12 && !url; i++) {
    const response = await axios.get(`https://api.ezremove.ai/api/ez-remove/background-remove/get-job/${encodeURIComponent(id)}`, { timeout: 15000 });
    url = response.data?.result?.output?.[0];
    if (!url) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!url || !String(url).startsWith('https://')) throw new Error('Background removal timed out');
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: MAX_INPUT });
  if (!String(response.headers?.['content-type'] || '').startsWith('image/')) throw new Error('Background service returned non-image data');
  return Buffer.from(response.data);
}

module.exports = { MAX_INPUT, MAX_STICKER, normalize, toSticker, aiArt, textArt, removeBackground };
