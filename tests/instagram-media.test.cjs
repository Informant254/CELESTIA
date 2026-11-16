const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Readable } = require('node:stream');

function load(relative, mocks = {}, fetchImpl, env = {}) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : native(id),
    process: { env }, fetch: fetchImpl, Buffer, URL, URLSearchParams, AbortSignal,
    AbortController, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}

function mediaApi(fetchImpl, env = {}) {
  const stories = load('../utils/instagramStories.js', {}, fetchImpl, env);
  return load('../utils/instagramMedia.js', { './instagramStories': stories }, fetchImpl, env);
}

test('Instagram post/reel URLs are parsed without accepting other sites or profile/story URLs', () => {
  const api = mediaApi();
  assert.equal(api.postTarget('https://www.instagram.com/reel/Dey_-U0CV0Z/?igsh=share').shortcode, 'Dey_-U0CV0Z');
  assert.equal(api.postTarget('instagram.com/p/De2lBovDcCh/').shortcode, 'De2lBovDcCh');
  assert.throws(() => api.postTarget('https://instagram.com.evil.example/p/ABC123/'), /valid Instagram/);
  assert.throws(() => api.postTarget('https://www.instagram.com/username/'), /igdp/);
  assert.throws(() => api.postTarget('https://www.instagram.com/stories/user/123/'), /igstory/);
});

test('posts and reels are resolved by the public embed page without any cookie header', async () => {
  let calls = 0;
  const api = mediaApi(async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, 'https://www.instagram.com');
    assert.equal(options.headers?.cookie, undefined);
    assert.equal(options.redirect, 'manual');
    return {
      ok: true,
      text: async () => '<meta property="og:video:secure_url" content="https://cdn-ig/video.mp4?_nc_ht=cdn&amp;_nc_ohc=x" />'
        + '<meta property="og:image" content="https://cdn-ig/photo.jpg" />',
    };
  }, { INSTAGRAM_COOKIE: 'sessionid=should-never-be-used' });
  const result = await api.fetchMedia('https://www.instagram.com/p/ABC123/');
  assert.equal(result.provider, 'instagram-public');
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].url, 'https://cdn-ig/video.mp4?_nc_ht=cdn&_nc_ohc=x');
  assert.equal(result.items[0].type, 'video');
  assert.equal(calls, 1);
});

test('album pages fall back to the public resolver and receive no operator credentials', async () => {
  const api = mediaApi(async (url) => {
    if (String(url).startsWith('https://api.bk9.dev')) {
      return { ok: true, json: async () => ({ status: true, BK9: [
        { url: 'https://cdn-ig/album1.jpg', type: 'image' },
        { url: 'https://cdn-ig/album2.mp4', type: 'video' },
      ] }) };
    }
    return { ok: true, text: async () => '<html>login page, no media</html>' };
  }, { INSTAGRAM_COOKIE: 'sessionid=private-fixture' });
  const result = await api.fetchMedia('https://www.instagram.com/p/ABC123/');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].type, 'image');
  assert.equal(result.items[1].type, 'video');
});

test('private or blocked posts produce a clear error, never a cookie hint', async () => {
  const api = mediaApi(async () => ({ ok: true, text: async () => '<html>login page</html>' }));
  await assert.rejects(api.fetchMedia('https://instagram.com/p/ABC123/'), error => {
    assert.equal(error.code, 'INSTAGRAM_BLOCKED');
    assert.doesNotMatch(error.message, /cookie|session|panel/i);
    return true;
  });
});

test('aborted requests stop immediately without reaching the public resolver', async () => {
  const controller = new AbortController();
  let calls = 0;
  const api = mediaApi(async () => {
    calls++;
    controller.abort(new Error('cancelled'));
    throw controller.signal.reason;
  });
  await assert.rejects(api.fetchMedia('https://www.instagram.com/p/ABC123/', controller.signal), /cancelled/);
  assert.equal(calls, 1);
});

test('albums download and deliver sequentially without ever sending cookies to the CDN', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const mp4 = Buffer.from('000000006674797000000000', 'hex');
  const calls = [];
  let active = false;
  const downloader = load('../utils/downloader.js', {
    axios: { get: async (url, options) => {
      calls.push(url);
      assert.equal(options.headers?.cookie, undefined);
      assert.ok(active);
      return { status: 200, headers: {}, data: Readable.from([url.includes('photo') ? jpeg : mp4]) };
    } },
    'yt-search': {},
    '../download/queue': { run: async fn => { active = true; try { return await fn(); } finally { active = false; } } },
    './instagramMedia': { fetchMedia: async () => ({ provider: 'instagram-public', items: [
      { id: '1', url: 'https://8.8.8.8/photo.jpg', type: 'image' },
      { id: '2', url: 'https://8.8.8.8/video.mp4', type: 'video' },
    ] }) },
    '../download/ytdlp': { attempt: async () => { throw new Error('Unexpected fallback'); } },
  }, undefined, { INSTAGRAM_COOKIE: 'sessionid=private-fixture' });
  const delivered = [];
  await downloader.downloadSocial('instagram', 'https://www.instagram.com/p/ABC123/', 1024, 'owner', async media => {
    assert.ok(active);
    assert.equal(calls.length, media.index, 'next album item is not buffered before delivery');
    delivered.push({ type: media.type, index: media.index, total: media.total });
  });
  assert.deepEqual(delivered, [{ type: 'image', index: 1, total: 2 }, { type: 'video', index: 2, total: 2 }]);
  assert.equal(active, false);
});

test('the Instagram yt-dlp fallback runs cookieless and cleans its work directory', async () => {
  for (const fail of [false, true]) {
    let directory;
    const downloader = load('../utils/downloader.js', {
      axios: {}, 'yt-search': {},
      '../download/ytdlp': { attempt: async options => {
        directory = options.workDir;
        assert.equal(options.youtube, false);
        assert.equal(options.extra, undefined, 'no cookie file is ever passed for Instagram');
        if (fail) throw new Error('Simulated engine failure');
        const file = path.join(directory, 'out.mp4');
        fs.writeFileSync(file, 'media');
        return { file };
      } },
      '../download/fallback': { validateFile: async () => {} },
    });
    const work = downloader.localSocial('https://www.instagram.com/reel/ABC123/', 1024, undefined);
    if (fail) await assert.rejects(work, /Simulated/); else assert.equal((await work).provider, 'yt-dlp');
    assert.equal(fs.existsSync(directory), false);
  }
});
