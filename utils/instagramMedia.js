const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function postTarget(input) {
  let value = String(input || '').trim();
  if (/^(?:www\.)?instagram\.com\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw new Error('Send a valid Instagram post or reel link.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
    || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase())) {
    throw new Error('Send a valid Instagram post or reel link.');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['p', 'reel', 'reels', 'tv'].includes(parts[0]) || !/^[A-Za-z0-9_-]{5,64}$/.test(parts[1] || '')) {
    throw new Error('Use .ig with a post/reel link, .igstory for stories, or .igdp for profile pictures.');
  }
  return { shortcode: parts[1], url: `https://www.instagram.com/p/${parts[1]}/` };
}

function shortcodeId(shortcode) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const character of shortcode) id = id * 64n + BigInt(alphabet.indexOf(character));
  return id.toString();
}

function unescapeMediaUrl(value) {
  return String(value)
    .replace(/\\u0026/gi, '&').replace(/\\u003A/gi, ':')
    .replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

function embedItems(html) {
  const items = [];
  const push = url => {
    if (!url) return;
    const decoded = unescapeMediaUrl(url);
    if (/^https:\/\/(?!static\.cdninstagram\.com)/.test(decoded) && !items.some(item => item.url === decoded)) {
      items.push({ url: decoded, type: /\.mp4(\?|$)/i.test(decoded) ? 'video' : 'image' });
    }
  };
  const metas = html.matchAll(/property="og:(video|image)(?::secure_url)?"\s+content="([^"]+)"/g);
  for (const match of metas) push(match[2]);
  const videoJson = html.match(/"(?:video_url|playable_url)":"([^"]+)"/);
  if (videoJson) push(videoJson[1]);
  const embeddedImage = html.match(/class="EmbeddedMediaImage"\s+src="([^"]+)"/);
  if (embeddedImage) push(embeddedImage[1]);
  return items.slice(0, 1);
}

function bk9Items(data) {
  const list = Array.isArray(data?.BK9) ? data.BK9
    : Array.isArray(data?.BK9?.media) ? data.BK9.media
    : Array.isArray(data?.media) ? data.media
    : [];
  const items = [];
  for (const entry of list) {
    const url = entry?.url || entry?.video_url || entry?.download_url || entry?.link;
    if (typeof url !== 'string' || !url.startsWith('https://')) continue;
    const type = /video|mp4/i.test(String(entry?.type || url)) ? 'video' : 'image';
    if (!items.some(item => item.url === url)) items.push({ url, type });
  }
  return items;
}

async function fetchMedia(pageUrl, signal) {
  const { shortcode, url } = postTarget(pageUrl);
  const items = [];
  try {
    const embed = await fetch(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
      headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.9' },
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    });
    if (embed.ok) {
      const html = await embed.text();
      items.push(...embedItems(html));
    }
  } catch (failure) {
    if (signal?.aborted) throw signal.reason;
  }
  if (!items.length) {
    try {
      const response = await fetch(`https://api.bk9.dev/download/ig?url=${encodeURIComponent(url)}`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
        redirect: 'error',
      });
      if (response.ok) items.push(...bk9Items(await response.json()));
    } catch (failure) {
      if (signal?.aborted) throw signal.reason;
    }
  }
  if (!items.length) {
    throw Object.assign(
      new Error('Instagram did not return public media for this post — it may be private, deleted, or age-flagged.'),
      { code: 'INSTAGRAM_BLOCKED' },
    );
  }
  return { items: items.slice(0, 20), provider: 'instagram-public' };
}

module.exports = { postTarget, fetchMedia, embedItems, bk9Items, shortcodeId };
