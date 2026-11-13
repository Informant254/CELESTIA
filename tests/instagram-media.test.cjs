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
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id]
      : id === './instagramSession' ? { readCookie: () => env.INSTAGRAM_COOKIE || '' } : native(id),
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

test('posts, reels and mixed albums use the saved session on Instagram requests', async () => {
  let calls = 0;
  const cookie = 'sessionid=fixture; csrftoken=csrf-fixture';
  const api = mediaApi(async (url, options) => {
    calls++;
    assert.equal(new URL(url).origin, 'https://www.instagram.com');
    assert.equal(options.headers.cookie, cookie);
    assert.equal(options.headers['x-csrftoken'], 'csrf-fixture');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.method, 'POST');
    const body = new URLSearchParams(options.body);
    assert.equal(JSON.parse(body.get('variables')).shortcode, 'ABC123');
    return { ok: true, headers: { get: () => null }, json: async () => ({ data: { xdt_api__v1__media__shortcode__web_info: { items: [{
      carousel_media: [
        { pk: '1', image_versions2: { candidates: [{ url: 'https://cdn/photo.jpg', width: 1080, height: 1080 }] } },
        { pk: '2', media_type: 2, video_versions: [{ url: 'https://cdn/video.mp4', width: 720, height: 1280 }] },
      ],
    }] } } }) };
  }, { INSTAGRAM_COOKIE: cookie });
  const result = await api.fetchMedia('https://www.instagram.com/p/ABC123/');
  assert.equal(result.provider, 'instagram-session');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].type, 'image');
  assert.equal(result.items[1].type, 'video');
  assert.equal(calls, 1);
});

test('failed session endpoints remain scoped to Instagram and never echo the cookie', async () => {
  const cookie = 'sessionid=secret-fixture; csrftoken=csrf-fixture';
  const api = mediaApi(async (url, options) => {
    assert.ok(['www.instagram.com', 'i.instagram.com'].includes(new URL(url).hostname));
    assert.equal(options.headers.cookie, cookie);
    return { ok: true, headers: { get: () => null }, json: async () => ({ status: 'fail', message: 'login_required' }) };
  }, { INSTAGRAM_COOKIE: cookie });
  await assert.rejects(api.fetchMedia('https://instagram.com/p/ABC123/'), error => {
    assert.equal(error.code, 'INSTAGRAM_LOGIN_REQUIRED');
    assert.doesNotMatch(error.message, /secret-fixture|csrf-fixture/);
    return true;
  });
});

test('Instagram cookie jars only apply to Instagram and reject control-character injection', () => {
  const api = mediaApi(undefined, { INSTAGRAM_COOKIE: 'sessionid=fixture; csrftoken=csrf' });
  const jar = api.cookieJar();
  assert.match(jar, /\.instagram\.com\tTRUE\t\/\tTRUE\t0\tsessionid\tfixture/);
  assert.doesNotMatch(jar, /youtube\.com|google\.com|bad\nline/);
  const invalid = load('../utils/instagramSession.js', {}, undefined, { INSTAGRAM_COOKIE: 'sessionid=bad\nline', INSTAGRAM_COOKIE_FILE: '__missing-test-session__.txt' });
  assert.equal(invalid.readCookie(), '');
});

test('authenticated albums download and deliver sequentially without sending cookies to the CDN', async () => {
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
    './instagramMedia': { fetchMedia: async () => ({ provider: 'instagram-session', items: [
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

test('Instagram yt-dlp fallback receives an isolated Instagram jar and always removes it', async () => {
  for (const fail of [false, true]) {
    let directory;
    let cookieFile;
    const downloader = load('../utils/downloader.js', {
      axios: {}, 'yt-search': {},
      './instagramMedia': { cookieJar: () => '# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\tfixture\n' },
      '../download/ytdlp': { attempt: async options => {
        directory = options.workDir;
        cookieFile = options.extra[options.extra.indexOf('--cookies') + 1];
        assert.equal(options.youtube, false);
        assert.match(fs.readFileSync(cookieFile, 'utf8'), /\.instagram.com/);
        if (fail) throw new Error('Simulated engine failure');
        const file = path.join(directory, 'out.mp4');
        fs.writeFileSync(file, 'media');
        return { file };
      } },
      '../download/fallback': { validateFile: async () => {} },
    });
    const work = downloader.localSocial('https://www.instagram.com/reel/ABC123/', 1024, undefined, true);
    if (fail) await assert.rejects(work, /Simulated/); else assert.equal((await work).provider, 'yt-dlp');
    assert.equal(fs.existsSync(cookieFile), false);
    assert.equal(fs.existsSync(directory), false);
  }
});
