const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, mocks = {}, fetchImpl, env = {}) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id]
      : id === './instagramSession' ? { readCookie: () => env.INSTAGRAM_COOKIE || '' } : native(id),
    process: { env }, fetch: fetchImpl, Buffer, URL, AbortSignal,
  }, { filename });
  return module.exports;
}

function response(data, status = 200, location = null) {
  return { ok: status >= 200 && status < 300, status,
    headers: { get: name => name === 'location' ? location : null },
    json: async () => data, text: async () => typeof data === 'string' ? data : JSON.stringify(data),
  };
}

test('stories accept handles, profile links and individual story links', () => {
  const { target } = load('../utils/instagramStories.js');
  assert.equal(target('@riazzeii').username, 'riazzeii');
  assert.equal(target('instagram.com/riazzeii?obrf=share').username, 'riazzeii');
  assert.equal(target('https://www.instagram.com/stories/riazzeii/12345/?igsh=share').storyId, '12345');
  assert.throws(() => target('https://instagram.com.evil.example/name'), /Instagram profile/);
  assert.throws(() => target('https://www.instagram.com/reel/post/'), /post\/reel/);
  assert.throws(() => target('https://www.instagram.com/stories/highlights/invalid/'), /not valid/);
});

test('authenticated stories resolve profile ID and choose the best video/image rendition', async () => {
  const calls = [];
  const api = load('../utils/instagramStories.js', {}, async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.cookie, 'sessionid=fixture; csrftoken=csrf');
    assert.equal(options.headers['x-csrftoken'], 'csrf');
    assert.equal(options.redirect, 'manual');
    if (url.endsWith('/riazzeii/')) return response('<script>{"page_id":"profilePage_98765"}</script>');
    return response({ status: 'ok', reel: { items: [
      { pk: '10', video_versions: [{ width: 320, height: 200, url: 'https://cdn/low.mp4' }, { width: 720, height: 1280, url: 'https://cdn/high.mp4' }] },
      { pk: '11', image_versions2: { candidates: [{ width: 1080, height: 1920, url: 'https://cdn/image.jpg' }] } },
    ] } });
  }, { INSTAGRAM_COOKIE: 'sessionid=fixture; csrftoken=csrf' });
  const result = await api.fetchStories('riazzeii');
  assert.equal(result.authenticated, true);
  assert.equal(result.stories[0].url, 'https://cdn/high.mp4');
  assert.equal(result.stories[1].type, 'image');
  assert.equal(calls.length, 2);
});

test('a rejected Instagram endpoint falls back without leaking cookies to the public provider', async () => {
  const api = load('../utils/instagramStories.js', {}, async (url, options) => {
    if (url.startsWith('https://www.instagram.com/')) return response({}, 429);
    assert.equal(options.headers, undefined);
    assert.equal(new URL(url).hostname, 'api.bk9.dev');
    return response({ status: true, BK9: { stories: [{ id: '12', download_url: 'https://cdn/story.jpg', type: 'image' }] } });
  }, { INSTAGRAM_COOKIE: 'sessionid=private-fixture' });
  const result = await api.fetchStories('example');
  assert.equal(result.provider, 'bk9');
  assert.equal(result.stories.length, 1);
});

test('GraphQL story media supports partial non-media errors and never substitutes a video thumbnail', () => {
  const { storyItems, mediaItems } = load('../utils/instagramStories.js');
  const data = { status: 'ok', errors: [{ message: 'story_view_count not available' }], data: { reels_media: [{ id: '7', items: [
    { id: '1', is_video: false, display_resources: [{ src: 'https://cdn/small.jpg', config_width: 100, config_height: 100 }, { src: 'https://cdn/full.jpg', config_width: 1080, config_height: 1920 }] },
    { id: '2', is_video: true, video_resources: [{ src: 'https://cdn/movie.mp4', config_width: 720, config_height: 1280 }], display_url: 'https://cdn/thumb.jpg' },
    { id: '3', is_video: true, display_url: 'https://cdn/not-a-video.jpg' },
  ] }] } };
  const stories = mediaItems(storyItems(data, '7'));
  assert.equal(stories.length, 2);
  assert.equal(stories[0].url, 'https://cdn/full.jpg');
  assert.equal(stories[1].type, 'video');
  assert.equal(stories[1].url, 'https://cdn/movie.mp4');
  assert.equal(storyItems({ status: 'ok', errors: [{ message: 'denied' }], data: { reels_media: [] } }, '7'), null);
});

test('provider errors are never reported as no active stories', async () => {
  const api = load('../utils/instagramStories.js', {}, async () => response({ status: false, message: 'upstream failure' }));
  await assert.rejects(api.fetchStories('example'), error => {
    assert.equal(error.code, 'INSTAGRAM_BLOCKED');
    assert.doesNotMatch(error.message, /no active stories/i);
    return true;
  });
});

test('only an explicit successful empty result is treated as no visible stories', async () => {
  const api = load('../utils/instagramStories.js', {}, async () => response({ status: true, BK9: { stories: [] } }));
  const result = await api.fetchStories('example');
  assert.equal(result.stories.length, 0);
  const { storyItems } = api;
  assert.equal(storyItems({ status: 'fail', reel: null }, '1'), null);
  assert.equal(storyItems({ status: 'ok', reel: null }, '1').length, 0);
  assert.equal(storyItems({ status: 'ok', reels: {} }, '1').length, 0);
  assert.equal(storyItems({ status: 'ok', reels: { '1': { items: [{ pk: '2' }] } } }, '1')[0].pk, '2');
  assert.equal(storyItems({ status: 'ok', reels_media: [{ id: '1', items: [{ pk: '3' }] }] }, '1')[0].pk, '3');
});

test('expired Instagram sessions produce a session-specific error rather than no stories', async () => {
  const api = load('../utils/instagramStories.js', {}, async (url) => url.includes('instagram.com')
    ? response({}, 302, '/accounts/login/?next=profile') : response({}, 503), { INSTAGRAM_COOKIE: 'sessionid=expired-fixture' });
  await assert.rejects(api.fetchStories('example'), error => error.code === 'INSTAGRAM_LOGIN_REQUIRED');
});

test('command filters an individual story and continues when one media item fails', async () => {
  const sent = [];
  const command = load('../commands/igstory.js', {
    '../utils/downloader': { downloadBuffer: async url => {
      if (url.includes('bad')) throw new Error('CDN unavailable');
      return Buffer.from('real-image');
    }, detectMediaType: () => 'image' },
    '../utils/instagramStories': {
      target: () => ({ username: 'example', storyId: null }),
      fetchStories: async () => ({ stories: [{ id: '1', url: 'https://cdn/bad.jpg' }, { id: '2', url: 'https://cdn/good.jpg' }], authenticated: true }),
    },
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  });
  await command.execute({ sendMessage: async (_, content) => { sent.push(content); return { key: 'progress' }; } }, { key: { remoteJid: 'chat' } }, ['example']);
  assert.equal(sent.filter(message => message.image).length, 1);
  assert.match(sent.at(-1).text, /Sent 1\/2/);
});

test('command does not send HTML as story media even if a provider calls it a video', async () => {
  const sent = [];
  const command = load('../commands/igstory.js', {
    '../utils/downloader': { downloadBuffer: async () => Buffer.from('<html>login</html>'), detectMediaType: () => null },
    '../utils/instagramStories': {
      target: () => ({ username: 'example', storyId: '2' }),
      fetchStories: async () => ({ stories: [{ id: '1', url: 'https://cdn/not-requested.mp4' }, { id: '2', url: 'https://cdn/requested.mp4', type: 'video' }], authenticated: true }),
    },
    '../download/config': { DOWNLOAD_TIMEOUT_MS: 5000, MAX_VIDEO_BYTES: 1024 },
    '../download/queue': { run: async fn => fn() },
  });
  await command.execute({ sendMessage: async (_, content) => { sent.push(content); return { key: 'progress' }; } }, { key: { remoteJid: 'chat' } }, ['story-url']);
  assert.equal(sent.some(message => message.video || message.image), false);
  assert.match(sent.at(-1).text, /media could not be downloaded/);
});
