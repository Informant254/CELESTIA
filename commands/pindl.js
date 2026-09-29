const axios = require('axios');
const { collectMediaUrls, detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');

function pinterestUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return null; }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'pin.it' && host !== 'pinterest.com' && !host.endsWith('.pinterest.com')) return null;
  return parsed.toString();
}

module.exports = {
  name: 'pindl',
  aliases: ['pin', 'pinterest'],
  description: 'Download Pinterest image or video. Usage: .pindl <link>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const text = args.join(' ').trim();

    const sourceUrl = pinterestUrl(text);
    if (!sourceUrl) {
      return sock.sendMessage(jid, { text: '📌 Provide a valid Pinterest link!' }, { quoted: msg });
    }

    try {
      await sock.sendMessage(jid, { text: '⏳ Fetching Pinterest media...' }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '📌', key: msg.key } });

      const res = await axios.get(`https://api.bk9.dev/download/pinterest?url=${encodeURIComponent(sourceUrl)}`, { timeout: 60000 });
      const payload = res.data?.BK9 ?? res.data?.result ?? res.data;

      // Normalize: bk9 shape, legacy medias shape, or any bare URL in payload.
      let title = payload?.title || 'Pinterest Media';
      let medias = [];
      if (payload && Array.isArray(payload.medias)) {
        medias = payload.medias;
      } else {
        const cands = collectMediaUrls(payload).filter((c) => !/thumb|preview|poster/i.test(c.key));
        medias = cands.map((c) => ({ url: c.url, extension: /\.mp4(\?|$)/i.test(c.url) ? 'mp4' : 'jpg' }));
      }

      if (!medias.length) {
        return sock.sendMessage(jid, { text: '❌ Failed to fetch Pinterest media.' }, { quoted: msg });
      }

      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(new Error('Overall request timeout exceeded.')), cfg.DOWNLOAD_TIMEOUT_MS);
        if (timeout.unref) timeout.unref();
        let sent = 0;
        try {
          for (const media of medias.slice(0, 5)) {
            const { url, extension, videoAvailable } = media;
            if (!url) continue;

            try {
              const buffer = await downloadBuffer(url, cfg.MAX_VIDEO_BYTES, 120000, 5, controller.signal);
              const type = detectMediaType(buffer, url) || (videoAvailable || extension === 'mp4' ? 'video' : null);
              if (type !== 'video' && type !== 'image') throw new Error('Provider returned unrecognized media.');
              const fileName = `${title}.${type === 'video' ? 'mp4' : (extension || 'jpg')}`.replace(/[^\w\s.-]/gi, '');

              if (type === 'video') {
                await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', fileName, caption: '📌 Pinterest Video' }, { quoted: msg });
              } else {
                await sock.sendMessage(jid, { image: buffer, fileName, caption: '📌 Pinterest Image' }, { quoted: msg });
              }
              sent += 1;
            } catch (err) {
              if (controller.signal.aborted) throw controller.signal.reason;
              console.error('[PINDL MEDIA ERROR]', err.message);
            }
          }
          if (!sent) throw new Error('No Pinterest media could be transferred.');
          return {};
        } finally {
          clearTimeout(timeout);
        }
      }, owner);
    } catch (err) {
      console.error('[PINDL ERROR]', err.message);
      await sock.sendMessage(jid, { text: '❌ Error downloading Pinterest media.' }, { quoted: msg });
    }
  },
};
