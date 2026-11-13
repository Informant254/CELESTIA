const { downloadBuffer, detectMediaType } = require('../utils/downloader');
const { readCookie } = require('../utils/instagramSession');

const MAX_DP_BYTES = 20 * 1024 * 1024;
const IG_APP_ID = '936619743392459';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function parseProfileLink(link, depth = 0) {
  link = String(link || '').trim().split(/\s+/)[0];
  let parsed;
  try { parsed = new URL(link); } catch { throw new Error('That Instagram link looks malformed.'); }
  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  if (!(host === 'instagram.com' || host.endsWith('.instagram.com'))) {
    throw new Error('That link is not an Instagram profile.');
  }
  let segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    const wrapped = parsed.searchParams.get('u');
    if (wrapped && depth < 2) {
      return parseProfileLink(wrapped.startsWith('http') ? wrapped : `https://${wrapped}`, depth + 1);
    }
    throw new Error('Send a profile username or link, not a post or reel link.');
  }
  let name = segments[0].replace(/^@/, '');
  if (name === 'stories' && segments[1]) name = segments[1];
  if (!name || ['p', 'reel', 'reels', 'explore', 'tv', 'accounts', 'directory', 's'].includes(name)) {
    throw new Error('Send a profile username or link, not a post or reel link.');
  }
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) {
    throw new Error(`"${name}" is not a valid Instagram username.`);
  }
  return name;
}

function parseUsername(input) {
  const value = String(input || '').trim();
  if (!value) {
    throw new Error('Provide an Instagram username or profile link.\nExample: `.igdp @leomessi`');
  }
  if (/^https?:\/\//i.test(value)) {
    return parseProfileLink(value);
  }
  if (/^(?:www\.)?instagram\.com\//i.test(value)) {
    return parseProfileLink(`https://${value}`);
  }
  const name = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) {
    throw new Error('Instagram usernames can only contain letters, numbers, dots, and underscores.');
  }
  return name;
}

function pictureUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    // Login pages also contain og:image, but it is Instagram's logo, not a DP.
    if (url.hostname === 'static.cdninstagram.com' || url.pathname.includes('/rsrc.php/')) return null;
    return url.toString();
  } catch { return null; }
}

function profileFromUser(user, username, provider) {
  if (user?.username && user.username.toLowerCase() !== username.toLowerCase()) return null;
  const url = pictureUrl(user?.profile_pic_url_hd) || pictureUrl(user?.profile_pic_url);
  if (!url) return null;
  return { url, fullName: user.full_name || '', private: Boolean(user.is_private), provider };
}

function embeddedProfile(html, username) {
  // The public embed serializes its own profile separately from post owners.
  // Decode both JSON layers; never execute the surrounding Instagram script.
  for (const match of html.matchAll(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/g)) {
    try {
      const { context } = JSON.parse(JSON.parse(match[1]));
      if (context?.username?.toLowerCase() !== username.toLowerCase()) continue;
      const profile = profileFromUser(context, username, 'embed');
      if (profile) return profile;
    } catch { /* Other script data is not a usable profile. */ }
  }
  return null;
}

function pageProfile(html) {
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const attr of tag[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
      attrs[attr[1].toLowerCase()] = attr[3];
    }
    if ((attrs.property || attrs.name)?.toLowerCase() !== 'og:image') continue;
    const value = (attrs.content || '').replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
      const number = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }).replace(/&amp;/g, '&');
    const url = pictureUrl(value);
    if (url) return { url, fullName: '', private: false, provider: 'web' };
  }
  return null;
}

async function fetchProfilePicture(username, signal) {
  const encoded = encodeURIComponent(username);
  const cookie = readCookie();
  const csrf = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
  const sources = [
    ['api', `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encoded}`],
    ['embed', `https://www.instagram.com/${encoded}/embed/`],
    ['web', `https://www.instagram.com/${encoded}/`],
  ];
  const failures = [];
  for (const [source, url] of sources) {
    if (signal?.aborted) throw signal.reason;
    try {
      const timeout = AbortSignal.timeout(12000);
      const response = await fetch(url, {
        headers: {
          'user-agent': source === 'api' ? BROWSER_UA : 'Mozilla/5.0',
          ...(source === 'api' ? { 'x-ig-app-id': IG_APP_ID, accept: 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
          ...(source === 'api' && csrf ? { 'x-csrftoken': csrf } : {}),
        },
        // Credentials are only sent to these fixed Instagram URLs, never to a redirect target.
        redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.url && /\/(accounts|challenge)\//i.test(new URL(response.url).pathname)) {
        throw new Error('Instagram login/challenge redirect');
      }
      let profile;
      if (source === 'api') {
        const data = await response.json();
        profile = profileFromUser(data?.data?.user, username, 'instagram');
      } else {
        const html = await response.text();
        profile = embeddedProfile(html, username) || (source === 'web' ? pageProfile(html) : null);
      }
      if (profile) return profile;
      throw new Error('Response did not expose the requested profile');
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      failures.push(`${source}: ${error.message}`);
    }
  }
  console.error('[IGDP SOURCES]', failures.join('; '));
  throw new Error(`Instagram did not allow this server to retrieve @${username}'s photo. This does not mean the profile has no picture. ${cookie ? 'The Instagram session may need refreshing, or Instagram is limiting requests.' : 'Save Instagram cookies in the private panel for authenticated access.'}`);
}

module.exports = {
  name: 'igdp',
  aliases: ['igpp', 'igprofile', 'instadp'],
  description: "Download an Instagram profile picture. Usage: .igdp <username or profile link>",
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;

    let username;
    try {
      username = parseUsername(args[0] || args.join(' '));
    } catch (error) {
      return sock.sendMessage(jid, { text: `📌 ${error.message}` }, { quoted: msg });
    }
    const tag = `@${username}`;

    await sock.sendMessage(jid, { react: { text: '📸', key: msg.key } });
    const status = await sock.sendMessage(jid, { text: `⏳ Fetching *${tag}*'s profile picture...` }, { quoted: msg });

    try {
      const profile = await fetchProfilePicture(username, AbortSignal.timeout(45000));
      const buffer = await downloadBuffer(profile.url, MAX_DP_BYTES, 60000, 5);
      if (detectMediaType(buffer) !== 'image') throw new Error('Instagram returned a page instead of an image. Please try again later.');
      const caption = [
        `👤 *${tag}*${profile.fullName ? ` — ${profile.fullName}` : ''}`,
        profile.private ? '🔒 Private account — only the profile picture is downloadable.' : null,
        '_via CELESTIA_',
      ].filter(Boolean).join('\n');
      await sock.sendMessage(jid, { image: buffer, caption }, { quoted: msg });
      await sock.sendMessage(jid, { text: '✅ Done!', edit: status.key });
    } catch (error) {
      console.error('[IGDP ERROR]', error.message);
      await sock.sendMessage(jid, { text: `❌ Couldn't fetch ${tag}'s profile picture: ${error.message}` }, { quoted: msg });
      await sock.sendMessage(jid, { text: '❌ Failed', edit: status.key }).catch(() => {});
    }
  },
  __internals: { parseUsername, fetchProfilePicture, embeddedProfile },
};
