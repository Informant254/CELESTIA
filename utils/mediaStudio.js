const fs = require('fs');
const path = require('path');
const axios = require('axios');
const settingsStore = require('./settingsStore');
const { ffmpegPath, ffprobePath, runOnce } = require('../download/engines');

const WA_LIMIT = 16 * 1024 * 1024;

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function wrapText(value, max = 24, maxLines = 8) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) line = next;
    else {
      if (line) lines.push(line);
      line = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.join(' ').length > lines.join(' ').length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, Math.max(1, max - 3))}...`;
  return lines;
}

async function createCard({ text, title = 'CELESTIA', author = '', background, output, width = 720, height = 1280 }) {
  const sharp = require('sharp');
  sharp.cache(false);
  const lines = wrapText(text, text.length > 120 ? 28 : 24, 9);
  const fontSize = text.length > 180 ? 42 : text.length > 100 ? 50 : 60;
  const startY = Math.max(340, 640 - lines.length * fontSize * 0.55);
  const tspans = lines.map((line, i) => `<tspan x="${width / 2}" y="${startY + i * (fontSize + 18)}">${escapeXml(line)}</tspan>`).join('');
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080d26"/><stop offset="0.52" stop-color="#28104f"/><stop offset="1" stop-color="#061b2d"/></linearGradient><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050816" stop-opacity=".3"/><stop offset=".4" stop-color="#050816" stop-opacity=".68"/><stop offset="1" stop-color="#050816" stop-opacity=".94"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><circle cx="610" cy="170" r="210" fill="#8b5cf6" opacity=".13"/><circle cx="90" cy="1080" r="250" fill="#22d3ee" opacity=".09"/>${background ? '<rect width="100%" height="100%" fill="url(#shade)"/>' : ''}
    <text x="360" y="130" text-anchor="middle" fill="#a5f3fc" font-family="sans-serif" font-size="24" letter-spacing="7">${escapeXml(title.toUpperCase())}</text><line x1="245" y1="165" x2="475" y2="165" stroke="#67e8f9" opacity=".65"/>
    <text text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="${fontSize}" font-weight="600">${tspans}</text>
    <text x="360" y="1080" text-anchor="middle" fill="#c4b5fd" font-family="sans-serif" font-size="27">${escapeXml(author)}</text><text x="360" y="1195" text-anchor="middle" fill="#67e8f9" opacity=".75" font-family="sans-serif" font-size="18" letter-spacing="5">CELESTIA OBSERVATORY</text>
  </svg>`;
  let base = background
    ? sharp(background).resize(width, height, { fit: 'cover' }).modulate({ brightness: 0.58, saturation: 0.82 }).blur(1)
    : sharp(Buffer.from(svg)).resize(width, height);
  if (background) base = base.composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  await base.jpeg({ quality: 86, mozjpeg: true }).toFile(output);
  return output;
}

async function generateImage(prompt) {
  const key = settingsStore.get('pollinations_key', null) || process.env.POLLINATIONS_KEY;
  if (!key) throw new Error('Pollinations key is not configured');
  const model = settingsStore.get('imagine_model', null) || process.env.IMAGINE_MODEL || 'flux';
  const response = await axios.post('https://gen.pollinations.ai/v1/images/generations', {
    model, prompt, size: '1024x1792', n: 1, response_format: 'b64_json',
  }, { timeout: 180000, maxContentLength: 30 * 1024 * 1024, headers: { Authorization: `Bearer ${key}` } });
  const item = response.data?.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return Buffer.from((await axios.get(item.url, { responseType: 'arraybuffer', timeout: 180000 })).data);
  throw new Error('Image provider returned no image');
}

async function mediaDuration(file) {
  const out = await runOnce(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], 30000);
  return Number(out) || 0;
}

async function createWaveform({ input, cover, output, seconds = 30 }) {
  await runOnce(ffmpegPath(), ['-y', '-loop', '1', '-framerate', '24', '-i', cover, '-i', input, '-filter_complex', '[1:a]aformat=channel_layouts=mono,showwaves=s=620x220:mode=line:colors=0x67E8F9@0.95:r=24,format=rgba[wave];[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280[bg];[bg][wave]overlay=(W-w)/2:H-330:format=auto[v]', '-map', '[v]', '-map', '1:a', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-shortest', output], 300000);
  if (fs.statSync(output).size > WA_LIMIT) throw new Error('Waveform output exceeds WhatsApp 16MB limit');
  return output;
}

async function statusJids(sock) {
  const own = sock.user?.id?.split(':')[0];
  const ids = new Set(own ? [`${own}@s.whatsapp.net`] : []);
  try {
    const groups = await Promise.race([sock.groupFetchAllParticipating(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))]);
    for (const group of Object.values(groups || {})) for (const p of group.participants || []) if (p.id?.endsWith('@s.whatsapp.net')) ids.add(p.id);
  } catch {}
  return [...ids];
}

async function postStatus(sock, content) {
  const list = await statusJids(sock);
  await sock.sendMessage('status@broadcast', content, { statusJidList: list });
  return list.length;
}

module.exports = { WA_LIMIT, escapeXml, wrapText, createCard, generateImage, mediaDuration, createWaveform, statusJids, postStatus };
