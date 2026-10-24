const { downloadBuffer } = require('../utils/downloader');

const MAX_DP_BYTES = 20 * 1024 * 1024;
const IG_APP_ID = '936619743392459';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function parseUsername(input) {
  const value = String(input || '').trim();
  if (!value) {
    throw new Error('Provide an Instagram username or profile link.\nExample: `.igdp @leomessi`');
  }
  if (/^https?:\/\//i.test(value)) {
    let parsed;
    try { parsed = new URL(value); } catch { throw new Error('That Instagram link looks malformed.'); }
    const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
    if (!(host === 'instagram.com' || host.endsWith('.instagram.com'))) {
      throw new Error('That link is not an Instagram profile.');
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    let name = segments[0];
    if (name === 'stories' && segments[1]) name = segments[1];
    if (!name || ['p', 'reel', 'reels', 'explore', 'tv', 'accounts', 'directory', 's'].includes(name)) {
      throw new Error('Send a profile username or link, not a post or reel link.');
    }
    if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) {
      throw new Error(`"${name}" is not a valid Instagram username.`);
    }
    return name;
  }
  const name = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) {
    throw new Error('Instagram usernames can only contain letters, numbers, dots, and underscores.');
  }
  return name;
}

async function fetchProfilePicture(username, signal) {
  try {
    const r = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: { 'x-ig-app-id': IG_APP_ID, accept: 'application/json', 'user-agent': BROWSER_UA }, signal }
    );
    if (r.ok) {
      const data = await r.json().catch(() => null);
      const user = data?.data?.user;
      if (user?.profile_pic_url) {
        return {
          url: user.profile_pic_url_hd || user.profile_pic_url,
          fullName: user.full_name || '',
          private: Boolean(user.is_private),
          provider: 'instagram',
        };
      }
      if (!user) throw new Error(`@${username} was not found.`);
    }
  } catch (error) {
    if (error.message?.includes('was not found') || signal?.aborted) throw error;
  }

  const page = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    headers: { 'user-agent': BROWSER_UA },
    signal,
  });
  if (!page.ok) throw new Error(`Could not reach Instagram for @${username} (HTTP ${page.status}).`);
  const html = await page.text();
  const hit = html.match(/property="og:image"[^>]*content="([^"]+)"/) || html.match(/content="([^"]+)"[^>]*property="og:image"/);
  if (!hit) throw new Error(`No profile picture was available for @${username}.`);
  return { url: hit[1].replace(/&amp;/g, '&'), fullName: '', private: false, provider: 'web' };
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
      const caption = [
        `👤 *${profile.fullName || tag}*`,
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
  __internals: { parseUsername, fetchProfilePicture },
};
