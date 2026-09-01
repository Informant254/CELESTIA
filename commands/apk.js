const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.apkmirror.com';

async function searchApkMirror(query) {
  const searchUrl = `${BASE}/?post_type=app_release&searchtype=apk&s=${encodeURIComponent(query)}`;
  const { data } = await axios.get(searchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${BASE}/`,
    },
    timeout: 15000,
  });
  const $ = cheerio.load(data);

  const results = [];
  $('.appRow').each((i, el) => {
    if (i >= 5) return;
    const titleEl = $(el).find('.appRowTitle a');
    const title = titleEl.text().trim();
    const link = titleEl.attr('href');
    if (title && link) results.push({ title, link: BASE + link });
  });
  return results;
}

module.exports = {
  name: 'apk',
  description: 'Search and get APK download links from APKMirror. Usage: .apk <app name>',
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const query = args.join(' ');

    if (!query) {
      return sock.sendMessage(jid, { text: '❌ Usage: .apk <app name>\nExample: .apk whatsapp' }, { quoted: msg });
    }

    await sock.sendMessage(jid, { text: `🔍 Searching APKMirror for "${query}"...` }, { quoted: msg });

    try {
      const results = await searchApkMirror(query);
      if (!results.length) {
        return sock.sendMessage(jid, { text: '❌ No results found on APKMirror.' }, { quoted: msg });
      }

      let text = `📱 *APKMirror results for "${query}":*\n\n`;
      results.forEach((r, i) => {
        text += `${i + 1}. ${r.title}\n${r.link}\n\n`;
      });
      text += `ℹ️ Open a link above to download — APKMirror requires solving a captcha, so the bot can't auto-fetch the APK file directly.`;

      await sock.sendMessage(jid, { text }, { quoted: msg });
    } catch (e) {
      console.error('[APK ERROR]', e.response?.status, e.message);
      const text = e.response?.status === 403
        ? "❌ APKMirror blocked this request (403) — it runs Cloudflare bot protection that a User-Agent/Referer header alone often can't get past from a server IP. If this keeps happening, the request likely needs to come through a residential-IP proxy, or APKMirror needs to be swapped for a source without that protection."
        : `❌ APK search failed: ${e.message}`;
      await sock.sendMessage(jid, { text }, { quoted: msg });
    }
  }
};

