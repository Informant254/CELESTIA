const { instagramRequest, mediaItems } = require('./instagramStories');
const { readCookie } = require('./instagramSession');

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

function postItems(data) {
  const native = data?.data?.xdt_api__v1__media__shortcode__web_info?.items?.[0] || data?.items?.[0];
  const graph = data?.data?.shortcode_media || data?.data?.xdt_shortcode_media;
  const root = native || graph;
  if (!root) return [];
  const nodes = root.carousel_media || root.edge_sidecar_to_children?.edges?.map(edge => edge.node) || [root];
  return mediaItems(nodes).slice(0, 20);
}

async function fetchMedia(pageUrl, signal) {
  const { shortcode } = postTarget(pageUrl);
  if (!readCookie()) throw new Error('Instagram session is not configured.');
  const body = new URLSearchParams({
    doc_id: '27128499623469141',
    variables: JSON.stringify({ shortcode, __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false }),
    server_timestamps: 'true',
  }).toString();
  const variables = encodeURIComponent(JSON.stringify({ shortcode }));
  const sources = [
    ['/graphql/query', false, { method: 'POST', body }],
    [`/graphql/query/?query_hash=2b0673e0dc4580674a88d426fe00ea90&variables=${variables}`, false, {}],
    [`/api/v1/media/${shortcodeId(shortcode)}/info/`, true, {}],
  ];
  let loginRequired = false;
  for (const [path, mobile, options] of sources) {
    if (signal?.aborted) throw signal.reason;
    try {
      const response = await instagramRequest(path, signal, mobile, options);
      const data = await response.json();
      if (/login_required|challenge_required|checkpoint_required/.test(data?.message || '')) {
        loginRequired = true;
        continue;
      }
      const items = postItems(data);
      if (items.length) return { items, provider: 'instagram-session' };
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      loginRequired ||= error.code === 'INSTAGRAM_LOGIN_REQUIRED';
    }
  }
  const message = loginRequired ? 'Instagram requires a fresh login session. Update Instagram cookies in the private panel.'
    : 'Instagram did not provide downloadable media for this post with the saved session.';
  throw Object.assign(new Error(message), { code: loginRequired ? 'INSTAGRAM_LOGIN_REQUIRED' : 'INSTAGRAM_BLOCKED' });
}

function cookieJar() {
  const header = readCookie();
  if (!header) return null;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const field of header.split(';')) {
    const index = field.indexOf('=');
    if (index <= 0) continue;
    const name = field.slice(0, index).trim();
    const value = field.slice(index + 1).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name) || !value || /[\x00-\x20\x7f]/.test(value)) continue;
    lines.push(`.instagram.com\tTRUE\t/\tTRUE\t0\t${name}\t${value}`);
  }
  if (lines.length === 1) throw new Error('The saved Instagram cookie has no usable values.');
  return lines.join('\n') + '\n';
}

module.exports = { postTarget, fetchMedia, postItems, cookieJar, shortcodeId };
