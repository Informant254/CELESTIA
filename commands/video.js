const axios = require('axios');
const { ytSearch, ytVideo, cleanName } = require('../utils/downloader');

const STREAM_TIMEOUT_MS = 45000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function reasonFor(e) {
  return e.response?.status === 429
    ? 'rate-limited'
    : e.response?.status
      ? `HTTP ${e.response.status}`
      : e.code === 'ECONNABORTED'
        ? 'timed out'
        : e.message;
}

module.exports = {
  name: 'video',
  aliases: ['ytv', 'ytmp4'],
  description: 'Download YouTube video (MP4). Usage: .video <video name or link>',
  async execute(sock, msg, args) {
    const rawJid = msg.key.remoteJid;
    const jid = rawJid.endsWith('@lid') && msg.key.remoteJidAlt
      ? msg.key.remoteJidAlt
      : rawJid;

    const text = args.join(' ').trim();

    if (!text) {
      return sock.sendMessage(
        jid,
        { text: '🎬 Provide a video name or YouTube link!\nEg: `.video Blinding Lights`' },
        { quoted: msg }
      );
    }

    let searching;
    try {
      await sock.sendMessage(jid, { react: { text: '🎬', key: msg.key } });
      searching = await sock.sendMessage(jid, { text: `🔍 Searching *${text}*...` }, { quoted: msg });
    } catch (e) {
      console.error('[VIDEO] Failed to send initial reaction/searching message:', e.message);
      return;
    }

    // ── 1. Resolve a video URL ────────────────────────────────────────────
    let videoUrl, videoTitle;
    try {
      if (/(youtube\.com|youtu\.be)/i.test(text)) {
        videoUrl = text;
        videoTitle = 'YouTube Video';
      } else {
        const found = await ytSearch(text);
        videoUrl = found.url;
        videoTitle = found.title;
      }
    } catch (e) {
      console.error('[VIDEO] Search step failed:', e.message);
      return sock.sendMessage(jid, {
        text: `❌ Search failed: ${reasonFor(e)}`,
        edit: searching.key
      });
    }

    await sock.sendMessage(jid, { text: `😍 Found: *${videoTitle}*\n⏳ Downloading...`, edit: searching.key });

    // ── 2. Resolve the actual download link ───────────────────────────────
    let downloadUrl, finalTitle;
    try {
      const res = await ytVideo(videoUrl, videoTitle);
      downloadUrl = res.url;
      finalTitle = res.title || videoTitle;
      console.log('[VIDEO] Resolved download link');
    } catch (e) {
      console.error('[VIDEO] downloader failed:', e.message);
      return sock.sendMessage(jid, {
        text: `❌ Download failed: ${e.message}`,
        edit: searching.key
      });
    }

    const fileName = cleanName(finalTitle, '.mp4');
    await sock.sendMessage(jid, { text: `✅ Downloading: *${finalTitle}*`, edit: searching.key });

    // ── 3. Send: try streaming the URL directly (cheap on memory), and if
    // that fails or hangs for any reason, fall back to a buffered download
    // so a bad CDN response doesn't just silently swallow the command.
    try {
      await withTimeout(
        sock.sendMessage(
          jid,
          { video: { url: downloadUrl }, mimetype: 'video/mp4', caption: `🎬 *${finalTitle}*` },
          { quoted: msg }
        ),
        STREAM_TIMEOUT_MS,
        'Video stream send'
      );
      return sock.sendMessage(jid, { text: `✅ Successfully downloaded *${finalTitle}*`, edit: searching.key });
    } catch (streamErr) {
      console.error('[VIDEO] Stream send failed, falling back to buffered download:', streamErr.message);
    }

    try {
      const head = await axios.head(downloadUrl, { timeout: 15000 }).catch(() => null);
      const size = head?.headers?.['content-length'];
      if (size && parseInt(size) > 150 * 1024 * 1024) {
        return sock.sendMessage(jid, { text: '❌ Video too large (>150MB) and direct streaming failed. Try a shorter video.', edit: searching.key });
      }

      const dlRes = await axios.get(downloadUrl, { responseType: 'arraybuffer', timeout: 120000 });
      const buffer = Buffer.from(dlRes.data);

      if (!buffer.length) {
        console.error('[VIDEO] Buffered download was empty for', downloadUrl);
        return sock.sendMessage(jid, { text: '❌ Downloaded file was empty. Try again.', edit: searching.key });
      }

      await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: `🎬 *${finalTitle}*` }, { quoted: msg });
      return sock.sendMessage(jid, { text: `✅ Successfully downloaded *${finalTitle}*`, edit: searching.key });
    } catch (e) {
      console.error('[VIDEO] Buffered fallback also failed:', e.response?.status, e.message);
      return sock.sendMessage(jid, { text: `❌ Failed to download/send video: ${reasonFor(e)}`, edit: searching.key });
    }
  },
};
