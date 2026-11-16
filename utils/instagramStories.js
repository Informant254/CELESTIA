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
  const resolved = target(username);
  let noStories = false;
  try {
    const response = await fetch(`https://api.bk9.dev/download/igs?username=${encodeURIComponent(resolved.username)}`, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (response.ok) {
      const data = await response.json();
      if (data.status === true && Array.isArray(data.BK9?.stories)) {
        const stories = mediaItems(data.BK9.stories);
        if (!data.BK9.stories.length) noStories = true;
        if (stories.length || noStories) return { stories, provider: 'bk9', authenticated: false };
      }
    }
  } catch (failure) { if (signal?.aborted) throw signal.reason; }
  if (noStories) return { stories: [], provider: 'bk9', authenticated: false };
  throw error('INSTAGRAM_BLOCKED', 'The public story provider is unavailable. This is not proof that the account has no stories.');
}

module.exports = { target, fetchStories, mediaItems, storyItems };
