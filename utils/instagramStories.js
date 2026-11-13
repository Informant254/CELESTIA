const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const { readCookie } = require('./instagramSession');

function target(input) {
  let value = String(input || '').trim();
  let storyId = null;
  if (/^(?:www\.)?instagram\.com\//i.test(value)) value = `https://${value}`;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname.toLowerCase()) || url.username || url.password) {
      throw new Error('Send an Instagram profile or story link.');
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'stories') {
      value = parts[1] || '';
      storyId = parts[2] || null;
      if (storyId && !/^\d+$/.test(storyId)) throw new Error('That Instagram story link is not valid.');
    } else {
      if (parts.length > 1 || ['p', 'reel', 'reels', 'explore', 'accounts'].includes(parts[0])) {
        throw new Error('Use a profile or story link, not a post/reel link.');
      }
      value = parts[0] || '';
    }
  }
  const username = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) throw new Error('Provide an Instagram username, profile URL or story URL.');
  return { username, storyId };
}

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

async function instagramRequest(path, signal, mobile = false, options = {}) {
  const cookie = readCookie();
  const csrf = cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
  const origin = mobile ? 'https://i.instagram.com' : 'https://www.instagram.com';
  const graphql = path.startsWith('/graphql/');
  const response = await fetch(`${origin}${path}`, {
    method: options.method || 'GET',
    ...(options.body === undefined ? {} : { body: options.body }),
    headers: {
      'user-agent': mobile ? 'Instagram 309.1.0.41.113 Android' : graphql ? 'Mozilla/5.0' : BROWSER_UA,
      'x-ig-app-id': mobile ? '567067343352427' : '936619743392459',
      ...(!mobile && !graphql ? {
        'x-requested-with': 'XMLHttpRequest',
        'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
        referer: 'https://www.instagram.com/',
      } : {}),
      ...(graphql ? { referer: 'https://www.instagram.com/' } : {}),
      ...(options.body === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
      ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrftoken': csrf } : {}),
    },
    redirect: 'manual',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  const location = response.headers.get('location');
  if (location && /\/(accounts\/login|challenge|checkpoint)\//i.test(new URL(location, origin).pathname)) {
    throw error('INSTAGRAM_LOGIN_REQUIRED', 'Instagram requires a fresh login session. Update Instagram cookies in the private panel.');
  }
  if (!response.ok) throw error('INSTAGRAM_BLOCKED', 'Instagram is refusing the media request from this server.');
  return response;
}

function mediaItems(items) {
  return items.map(item => {
    const best = versions => {
      const sorted = Array.isArray(versions) ? [...versions].sort((a, b) =>
        (b.width || b.config_width || 0) * (b.height || b.config_height || 0) - (a.width || a.config_width || 0) * (a.height || a.config_height || 0)) : [];
      return sorted[0]?.url || sorted[0]?.src;
    };
    const video = best(item.video_versions) || best(item.video_resources) || item.video_url;
    const image = best(item.image_versions2?.candidates) || best(item.display_resources) || item.display_url;
    const isVideo = Boolean(video || item.is_video || item.media_type === 2);
    return {
      id: String(item.pk || item.id || '').split('_')[0],
      url: isVideo ? video : image || item.download_url || item.url,
      type: isVideo ? 'video' : image ? 'image' : item.type,
    };
  }).filter(item => typeof item.url === 'string' && item.url.startsWith('https://'));
}

function storyItems(data, id) {
  if (data?.status !== 'ok') return null;
  if (Array.isArray(data.data?.reels_media)) {
    const reel = data.data.reels_media.find(item => String(item.id) === id);
    if (Array.isArray(reel?.items) && (reel.items.length || !data.errors?.length)) return reel.items;
    if (data.data.reels_media.length === 0 && !data.errors?.length) return [];
    return null;
  }
  const reel = data.reel || data.reels?.[id] || data.reels_media?.find(item => String(item.id) === id);
  if (Array.isArray(reel?.items)) return reel.items;
  if (data.reel === null || (Array.isArray(data.reels_media) && data.reels_media.length === 0)) return [];
  if (data.reels && typeof data.reels === 'object' && !Array.isArray(data.reels) && Object.keys(data.reels).length === 0) return [];
  return null;
}

async function fetchStories(username, signal) {
  let loginRequired = false;
  if (readCookie()) {
    try {
      // The HTML route often works on hosts where web_profile_info is rate-limited.
      const page = await instagramRequest(`/${encodeURIComponent(username)}/`, signal);
      const html = await page.text();
      let id = html.match(/profilePage_(\d+)/)?.[1];
      if (!id) {
        const response = await instagramRequest(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, signal);
        const profile = await response.json();
        if (profile?.data?.user?.username?.toLowerCase() === username.toLowerCase()) id = String(profile.data.user.id || '');
      }
      if (!/^\d+$/.test(id || '')) throw error('INSTAGRAM_BLOCKED', 'Instagram did not expose the requested profile.');
      const variables = encodeURIComponent(JSON.stringify({ reel_ids: [id], precomposed_overlay: false }));
      const endpoints = [
        [`/graphql/query/?query_hash=303a4ae99711322310f25250d988f3b7&variables=${variables}`, false],
        [`/api/v1/feed/reels_media/?reel_ids=${id}`, true],
        [`/api/v1/feed/user/${id}/story/`, false],
        [`/api/v1/feed/user/${id}/story/`, true],
        [`/api/v1/feed/reels_media/?reel_ids=${id}`, false],
      ];
      for (const [path, mobile] of endpoints) {
        try {
          const response = await instagramRequest(path, signal, mobile);
          const data = await response.json();
          if (/login_required|challenge_required|checkpoint_required/.test(data?.message || '')) {
            throw error('INSTAGRAM_LOGIN_REQUIRED', 'Instagram requires a fresh login session for stories. Update Instagram cookies in the private panel.');
          }
          const items = storyItems(data, id);
          if (items !== null) {
            const stories = mediaItems(items);
            if (items.length && !stories.length) throw error('INSTAGRAM_BLOCKED', 'Instagram returned stories without downloadable media.');
            return { stories, provider: 'instagram', authenticated: true };
          }
        } catch (failure) {
          if (signal?.aborted) throw signal.reason;
          loginRequired ||= failure.code === 'INSTAGRAM_LOGIN_REQUIRED';
        }
      }
    } catch (failure) {
      if (signal?.aborted) throw signal.reason;
      loginRequired ||= failure.code === 'INSTAGRAM_LOGIN_REQUIRED';
    }
  }

  // Public fallback never receives the operator's Instagram cookies.
  try {
    const response = await fetch(`https://api.bk9.dev/download/igs?username=${encodeURIComponent(username)}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (response.ok) {
      const data = await response.json();
      if (data.status === true && Array.isArray(data.BK9?.stories)) {
        const stories = mediaItems(data.BK9.stories);
        if (!data.BK9.stories.length || stories.length) return { stories, provider: 'bk9', authenticated: false };
      }
    }
  } catch { if (signal?.aborted) throw signal.reason; }
  if (loginRequired) throw error('INSTAGRAM_LOGIN_REQUIRED', 'Instagram requires a fresh login session for stories. Update Instagram cookies in the private panel.');
  throw error('INSTAGRAM_BLOCKED', readCookie()
    ? 'Instagram and the story provider could not retrieve these stories. The session may need refreshing, or Instagram is blocking this server. This is not proof that the account has no stories.'
    : 'The public story provider is unavailable. Save Instagram cookies in the private panel for authenticated access.');
}

module.exports = { target, fetchStories, mediaItems, storyItems, instagramRequest };
