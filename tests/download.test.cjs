const { test } = require('node:test');
const assert = require('node:assert/strict');

const ytdlp = require('../download/ytdlp');

// utils/downloader binds axios at require time, so each stub test needs a
// fresh copy — otherwise the first stub leaks into later tests.
function freshDownloader() {
  delete require.cache[require.resolve('../utils/downloader')];
  return require('../utils/downloader');
}

test('yt-dlp carries a node JS runtime for YouTube challenges', () => {
  const args = ytdlp.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null);
  const i = args.indexOf('--js-runtimes');
  assert.ok(i >= 0, '--js-runtimes present');
  assert.equal(args[i + 1], 'node');
  assert.ok(Array.isArray(args));
});

test('audio fallback tries bk9 before davidcyril', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const calls = [];
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        calls.push(url);
        return { data: { status: true, BK9: { downloadUrl: 'https://example.com/f.mp3', title: 'T' } } };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const r = await dl.ytAudio('https://www.youtube.com/watch?v=x');
    assert.equal(r.url, 'https://example.com/f.mp3');
    assert.equal(calls.length, 1, 'first provider wins, no wasted calls');
    assert.match(calls[0], /api\.bk9\.dev/, 'bk9 attempted first');
  } finally {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('audio fallback reaches davidcyril when bk9 fails', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const calls = [];
  const prevKey = process.env.DAVIDCYRIL_APIKEY;
  process.env.DAVIDCYRIL_APIKEY = 'test-david-key';
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        calls.push(url);
        if (url.includes('bk9')) throw Object.assign(new Error('boom'), { response: { status: 500 } });
        return { data: { success: true, result: { download_url: 'https://example.com/g.mp3', title: 'G' } } };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const r = await dl.ytAudio('https://www.youtube.com/watch?v=x');
    assert.equal(r.url, 'https://example.com/g.mp3');
    assert.equal(calls.length, 2);
    assert.match(calls[1], /davidcyriltech/, 'davidcyril second');
  } finally {
    if (prevKey === undefined) delete process.env.DAVIDCYRIL_APIKEY;
    else process.env.DAVIDCYRIL_APIKEY = prevKey;
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('keyless audio fallback never contacts a key-gated provider', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const prevKey = process.env.DAVIDCYRIL_APIKEY;
  const calls = [];
  delete process.env.DAVIDCYRIL_APIKEY;
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: async (url) => { calls.push(url); throw new Error('down'); } },
  };
  try {
    const dl = freshDownloader();
    await assert.rejects(() => dl.ytAudio('https://www.youtube.com/watch?v=x'), /Audio download failed/);
    assert.equal(calls.length, 1, 'only the free BK9 provider was contacted');
    assert.match(calls[0], /api\.bk9\.dev/);
  } finally {
    if (prevKey === undefined) delete process.env.DAVIDCYRIL_APIKEY;
    else process.env.DAVIDCYRIL_APIKEY = prevKey;
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('davidcyril API key is attached when configured', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const calls = [];
  const prevKey = process.env.DAVIDCYRIL_APIKEY;
  process.env.DAVIDCYRIL_APIKEY = 'test-key-123';
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: async (url) => { calls.push(url); throw new Error('down'); } },
  };
  try {
    const dl = freshDownloader();
    await assert.rejects(() => dl.ytVideo('https://www.youtube.com/watch?v=x'), /Video download failed/);
    assert.ok(calls.some((u) => u.includes('apikey=test-key-123')), 'key attached as query param');
  } finally {
    if (prevKey === undefined) delete process.env.DAVIDCYRIL_APIKEY;
    else process.env.DAVIDCYRIL_APIKEY = prevKey;
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('yt-dlp uses YouTube cookies when a cookie file is present', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const p = require('node:path');
  const prev = process.env.YOUTUBE_COOKIES_FILE;
  const tmp = p.join(fs.mkdtempSync(p.join(os.tmpdir(), 'ck-')), 'youtube.txt');
  fs.writeFileSync(tmp, '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\txyz\n');
  process.env.YOUTUBE_COOKIES_FILE = tmp;
  try {
    delete require.cache[require.resolve('../download/ytdlp')];
    const fresh = require('../download/ytdlp');
    assert.equal(fresh.cookieFile(), tmp);
    const args = fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null);
    const i = args.indexOf('--cookies');
    assert.ok(i >= 0, '--cookies present');
    assert.equal(args[i + 1], tmp);
  } finally {
    if (prev === undefined) delete process.env.YOUTUBE_COOKIES_FILE;
    else process.env.YOUTUBE_COOKIES_FILE = prev;
    try { fs.unlinkSync(tmp); } catch {}
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('yt-dlp omits --cookies when no cookie file exists', () => {
  const prev = process.env.YOUTUBE_COOKIES_FILE;
  delete process.env.YOUTUBE_COOKIES_FILE;
  delete require.cache[require.resolve('../download/ytdlp')];
  try {
    const fresh = require('../download/ytdlp');
    assert.equal(fresh.cookieFile(), null);
    const args = fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null);
    assert.ok(!args.includes('--cookies'), 'no --cookies without a file');
  } finally {
    if (prev !== undefined) process.env.YOUTUBE_COOKIES_FILE = prev;
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('yt-dlp routes YouTube through the configured commercial proxy', () => {
  const prev = process.env.YOUTUBE_PROXY;
  process.env.YOUTUBE_PROXY = 'http://user:pass@proxy.example.com:8000';
  delete require.cache[require.resolve('../download/ytdlp')];
  try {
    const fresh = require('../download/ytdlp');
    const args = fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null);
    const i = args.indexOf('--proxy');
    assert.ok(i >= 0, '--proxy present');
    assert.equal(args[i + 1], process.env.YOUTUBE_PROXY);
  } finally {
    if (prev === undefined) delete process.env.YOUTUBE_PROXY;
    else process.env.YOUTUBE_PROXY = prev;
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('yt-dlp rejects unsupported proxy URL schemes', () => {
  const prev = process.env.YOUTUBE_PROXY;
  process.env.YOUTUBE_PROXY = 'file:///etc/passwd';
  delete require.cache[require.resolve('../download/ytdlp')];
  try {
    const fresh = require('../download/ytdlp');
    assert.equal(fresh.youtubeProxy(), null);
    assert.ok(!fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null).includes('--proxy'));
  } finally {
    if (prev === undefined) delete process.env.YOUTUBE_PROXY;
    else process.env.YOUTUBE_PROXY = prev;
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('yt-dlp accepts one configured literal source address', () => {
  const prev = process.env.YOUTUBE_SOURCE_ADDRESS;
  process.env.YOUTUBE_SOURCE_ADDRESS = '2001:db8::42';
  delete require.cache[require.resolve('../download/ytdlp')];
  try {
    const fresh = require('../download/ytdlp');
    const args = fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null);
    const i = args.indexOf('--source-address');
    assert.ok(i >= 0);
    assert.equal(args[i + 1], '2001:db8::42');
    process.env.YOUTUBE_SOURCE_ADDRESS = 'not-an-ip';
    assert.equal(fresh.sourceAddress(), null);
  } finally {
    if (prev === undefined) delete process.env.YOUTUBE_SOURCE_ADDRESS;
    else process.env.YOUTUBE_SOURCE_ADDRESS = prev;
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('social yt-dlp calls do not inherit YouTube cookies or proxy settings', () => {
  const prevCookies = process.env.YOUTUBE_COOKIES_FILE;
  const prevProxy = process.env.YOUTUBE_PROXY;
  process.env.YOUTUBE_COOKIES_FILE = __filename;
  process.env.YOUTUBE_PROXY = 'https://proxy.example.com';
  delete require.cache[require.resolve('../download/ytdlp')];
  try {
    const fresh = require('../download/ytdlp');
    const args = fresh.baseArgs('/tmp/work', '/usr/bin/ffmpeg', null, { youtube: false });
    assert.ok(!args.includes('--cookies'));
    assert.ok(!args.includes('--proxy'));
  } finally {
    if (prevCookies === undefined) delete process.env.YOUTUBE_COOKIES_FILE;
    else process.env.YOUTUBE_COOKIES_FILE = prevCookies;
    if (prevProxy === undefined) delete process.env.YOUTUBE_PROXY;
    else process.env.YOUTUBE_PROXY = prevProxy;
    delete require.cache[require.resolve('../download/ytdlp')];
  }
});

test('apix is always tried first and wins without touching yt-dlp', async () => {
  const ytdlpPath = require.resolve('../download/ytdlp');
  const ffmpegPath = require.resolve('../download/ffmpeg');
  const apiPath = require.resolve('../utils/downloader');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([ytdlpPath, ffmpegPath, apiPath, fallbackPath].map((p) => [p, require.cache[p]]));
  let ytdlpCalls = 0;
  require.cache[ytdlpPath] = { id: ytdlpPath, filename: ytdlpPath, loaded: true, exports: {
    attempt: async () => { ytdlpCalls++; throw new Error('yt-dlp should not run'); },
  } };
  require.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: {
    streams: async () => [{ codec_type: 'audio' }],
    probe: async () => ({ size: 10, duration: 180 }),
  } };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
    apixAudio: async () => ({ url: 'https://apix.wolvarex.com/api/music/proxy?id=x', title: 'T' }),
    downloadBuffer: async () => Buffer.from('FAKEMP3'),
  } };
  const fs = require('node:fs');
  const stat = fs.promises.stat;
  const written = [];
  const writeFile = fs.promises.writeFile;
  fs.promises.stat = async (p) => String(p).endsWith('out.mp3') ? { size: 7 } : stat(p);
  fs.promises.writeFile = async (p) => { written.push(String(p)); };
  delete require.cache[fallbackPath];
  try {
    const fallback = require('../download/fallback');
    const result = await fallback.downloadWithFallback({
      url: 'https://youtube.com/watch?v=x', title: 'Artist - Song', isAudio: true, workDir: '/tmp', maxBytes: 100,
    });
    assert.equal(result.strategy, 'apix');
    assert.equal(result.engine, 'apix');
    assert.equal(ytdlpCalls, 0, 'yt-dlp never attempted');
    assert.ok(written.some((p) => p.endsWith('out.mp3')), 'bytes written');
  } finally {
    fs.promises.stat = stat;
    fs.promises.writeFile = writeFile;
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
  }
});

test('apix-only mode skips every fallback and fails fast', async () => {
  const settingsStore = require('../utils/settingsStore');
  const prev = settingsStore.get('download_apix_only', undefined);
  settingsStore.set('download_apix_only', true);
  const ytdlpPath = require.resolve('../download/ytdlp');
  const ffmpegPath = require.resolve('../download/ffmpeg');
  const apiPath = require.resolve('../utils/downloader');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([ytdlpPath, ffmpegPath, apiPath, fallbackPath].map((p) => [p, require.cache[p]]));
  let ytdlpCalls = 0;
  require.cache[ytdlpPath] = { id: ytdlpPath, filename: ytdlpPath, loaded: true, exports: {
    attempt: async () => { ytdlpCalls++; throw new Error('should not run'); },
  } };
  require.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: {
    streams: async () => [{ codec_type: 'audio' }],
  } };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
    apixAudio: async () => { throw new Error('Apix down'); },
  } };
  delete require.cache[fallbackPath];
  try {
    const fallback = require('../download/fallback');
    await assert.rejects(
      () => fallback.downloadWithFallback({ url: 'https://youtube.com/watch?v=x', title: 'T', isAudio: true, workDir: '/tmp', maxBytes: 100 }),
      /Apix down/
    );
    assert.equal(ytdlpCalls, 0, 'no fallback attempted');
  } finally {
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
    if (prev === undefined) settingsStore.set('download_apix_only', false);
    else settingsStore.set('download_apix_only', prev);
  }
});

test('audio fallback goes to direct APIs when apix and yt-dlp fail', async () => {
  const ytdlpPath = require.resolve('../download/ytdlp');
  const ffmpegPath = require.resolve('../download/ffmpeg');
  const apiPath = require.resolve('../utils/downloader');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([ytdlpPath, ffmpegPath, apiPath, fallbackPath].map((p) => [p, require.cache[p]]));
  const calls = [];
  require.cache[ytdlpPath] = { id: ytdlpPath, filename: ytdlpPath, loaded: true, exports: {
    attempt: async ({ url }) => {
      calls.push(url);
      throw new Error('youtube blocked');
    },
  } };
  require.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: {
    streams: async () => [{ codec_type: 'audio' }],
    probe: async () => ({ size: 10, duration: 180 }),
  } };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: {
    apixAudio: async () => { throw new Error('no Apix key configured'); },
    ytAudio: async () => ({ url: 'https://example.com/f.mp3', title: 'T' }),
    downloadBuffer: async () => Buffer.from('DIRECTMP3'),
  } };
  const fs = require('node:fs');
  const stat = fs.promises.stat;
  const writeFile = fs.promises.writeFile;
  fs.promises.stat = async (p) => String(p).endsWith('out.mp3') ? { size: 9 } : stat(p);
  fs.promises.writeFile = async () => {};
  delete require.cache[fallbackPath];
  try {
    const fallback = require('../download/fallback');
    const result = await fallback.downloadWithFallback({
      url: 'https://youtube.com/watch?v=x', title: 'Artist - Song', isAudio: true, workDir: '/tmp', maxBytes: 100,
    });
    assert.equal(result.strategy, 'api-direct');
    assert.ok(calls.length > 0, 'yt-dlp tried first');
    assert.ok(!calls.some((u) => String(u).startsWith('scsearch')), 'no soundcloud anywhere');
  } finally {
    fs.promises.stat = stat;
    fs.promises.writeFile = writeFile;
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
  }
});

test('apix audio resolves a same-host proxied download URL', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const prev = process.env.APIX_KEY;
  process.env.APIX_KEY = 'test-apix-key';
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        assert.match(url, /apix\.wolvarex\.com\/api\/download\/youtube\/mp3/, 'apix mp3 endpoint');
        assert.match(url, /key=test-apix-key/, 'key attached');
        return { data: { success: true, title: 'T', downloadUrl: 'https://apix.wolvarex.com/api/music/proxy?id=x&format=mp3' } };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const r = await dl.apixAudio('https://www.youtube.com/watch?v=x');
    assert.equal(r.url, 'https://apix.wolvarex.com/api/music/proxy?id=x&format=mp3&key=test-apix-key');
  } finally {
    if (prev === undefined) delete process.env.APIX_KEY;
    else process.env.APIX_KEY = prev;
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('apix audio fails fast with a clear message when no key is set', async () => {
  const prev = process.env.APIX_KEY;
  delete process.env.APIX_KEY;
  try {
    const dl = freshDownloader();
    await assert.rejects(() => dl.apixAudio('https://www.youtube.com/watch?v=x'), /no Apix key/);
  } finally {
    if (prev !== undefined) process.env.APIX_KEY = prev;
  }
});

test('video fallback tries the active BK9 YouTube endpoint before davidcyril', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const calls = [];
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        calls.push(url);
        return {
          data: {
            status: true,
            BK9: { filename: 'Video.mp4', quality: '480p', url: 'https://example.com/video.mp4' },
          },
        };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const result = await dl.ytVideo('https://www.youtube.com/watch?v=x');
    assert.equal(result.title, 'Video');
    assert.equal(result.quality, '480p');
    assert.equal(calls.length, 1);
    assert.match(calls[0], /api\.bk9\.dev\/download\/youtube/);
  } finally {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('social fallback tries alternate BK9 extractors', async () => {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  const calls = [];
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (url) => {
        calls.push(url);
        if (url.includes('/tiktok?')) throw Object.assign(new Error('down'), { response: { status: 500 } });
        return { data: { status: true, BK9: { play: 'https://example.com/video.mp4' } } };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const result = await dl.bk9Social('tiktok', 'https://www.tiktok.com/@user/video/1');
    assert.equal(result.url, 'https://example.com/video.mp4');
    assert.equal(calls.length, 2);
    assert.match(calls[1], /\/tiktok2\?/);
  } finally {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  }
});

test('media type detection uses file signatures instead of expiring URL extensions', () => {
  const dl = freshDownloader();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const mp4 = Buffer.from('000000006674797000000000', 'hex');
  assert.equal(dl.detectMediaType(jpeg, 'https://cdn.example/file'), 'image');
  assert.equal(dl.detectMediaType(mp4, 'https://cdn.example/file.jpg'), 'video');
  assert.equal(dl.detectMediaType(Buffer.from('<html>provider error</html>'), 'https://cdn.example/file'), null);
});

test('social download rejects a mismatched platform host before contacting providers', async () => {
  const dl = freshDownloader();
  assert.throws(
    () => dl.validateSocialPageUrl('tiktok', 'https://example.com/not-tiktok'),
    /not a supported tiktok URL/
  );
  await assert.rejects(
    () => dl.downloadSocial('instagram', 'https://127.0.0.1/private'),
    /not a supported instagram URL/
  );
});

test('social download falls back to local yt-dlp without an API key', async () => {
  const axiosPath = require.resolve('axios');
  const ytdlpPath = require.resolve('../download/ytdlp');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([axiosPath, ytdlpPath, fallbackPath].map((p) => [p, require.cache[p]]));
  const fs = require('node:fs');
  const path = require('node:path');
  const queue = require('../download/queue');
  let sawYouTubeMode;
  let sawSignal;
  let activeDuringDelivery;
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: async () => { throw new Error('public resolver unavailable'); } },
  };
  require.cache[ytdlpPath] = {
    id: ytdlpPath, filename: ytdlpPath, loaded: true,
    exports: {
      attempt: async ({ workDir, youtube, signal }) => {
        sawYouTubeMode = youtube;
        sawSignal = signal;
        const file = path.join(workDir, 'out.mp4');
        fs.writeFileSync(file, Buffer.from('LOCAL-SOCIAL-VIDEO'));
        return { file, size: 18 };
      },
    },
  };
  require.cache[fallbackPath] = {
    id: fallbackPath, filename: fallbackPath, loaded: true,
    exports: { validateFile: async () => true },
  };
  try {
    const dl = freshDownloader();
    const result = await dl.downloadSocial(
      'tiktok',
      'https://www.tiktok.com/@user/video/1',
      1024,
      'test-owner',
      async (media) => {
        activeDuringDelivery = queue.stats().active;
        return media;
      }
    );
    assert.equal(result.provider, 'yt-dlp');
    assert.equal(result.type, 'video');
    assert.equal(result.buffer.toString(), 'LOCAL-SOCIAL-VIDEO');
    assert.equal(sawYouTubeMode, false);
    assert.ok(sawSignal instanceof AbortSignal, 'social yt-dlp receives the overall abort signal');
    assert.equal(activeDuringDelivery, 1, 'queue remains acquired through media delivery');
    assert.equal(queue.stats().active, 0);
  } finally {
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
    delete require.cache[require.resolve('../utils/downloader')];
  }
});

test('legacy YouTube commands use the full fallback pipeline and clean temporary files', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const cfg = require('../download/config');
  const queue = require('../download/queue');
  const fallbackPath = require.resolve('../download/fallback');
  const original = require.cache[fallbackPath];
  let workDir;
  let byteLimit;
  require.cache[fallbackPath] = {
    id: fallbackPath, filename: fallbackPath, loaded: true,
    exports: {
      downloadWithFallback: async (options) => {
        workDir = options.workDir;
        byteLimit = options.maxBytes;
        const file = path.join(workDir, 'out.mp3');
        fs.writeFileSync(file, 'MEDIA');
        return { file, size: 5, engine: 'test', strategy: 'test' };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const result = await dl.downloadYoutubeAudio('https://youtube.com/watch?v=x', 'Track');
    assert.equal(result.buffer.toString(), 'MEDIA');
    assert.equal(result.title, 'Track');
    assert.equal(byteLimit, cfg.MAX_AUDIO_BYTES);
    assert.equal(queue.stats().active, 0, 'shared queue slot released');
    assert.equal(fs.existsSync(workDir), false, 'temporary job directory removed');
  } finally {
    if (original) require.cache[fallbackPath] = original;
    else delete require.cache[fallbackPath];
  }
});

test('legacy YouTube queue stays acquired through media delivery', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const queue = require('../download/queue');
  const fallbackPath = require.resolve('../download/fallback');
  const original = require.cache[fallbackPath];
  let activeDuringDelivery;
  require.cache[fallbackPath] = {
    id: fallbackPath, filename: fallbackPath, loaded: true,
    exports: {
      downloadWithFallback: async ({ workDir }) => {
        const file = path.join(workDir, 'out.mp3');
        fs.writeFileSync(file, 'MEDIA');
        return { file, size: 5, engine: 'test', strategy: 'test' };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const delivered = await dl.downloadYoutubeAudio(
      'https://youtube.com/watch?v=x',
      'Track',
      undefined,
      'test-owner',
      async ({ buffer }) => {
        activeDuringDelivery = queue.stats().active;
        return buffer.toString();
      }
    );
    assert.equal(delivered, 'MEDIA');
    assert.equal(activeDuringDelivery, 1);
    assert.equal(queue.stats().active, 0);
  } finally {
    if (original) require.cache[fallbackPath] = original;
    else delete require.cache[fallbackPath];
  }
});

test('legacy YouTube timeout aborts the fallback before releasing its queue slot', async () => {
  const cfg = require('../download/config');
  const queue = require('../download/queue');
  const fallbackPath = require.resolve('../download/fallback');
  const original = require.cache[fallbackPath];
  const previousTimeout = cfg.DOWNLOAD_TIMEOUT_MS;
  let sawAbort = false;
  cfg.DOWNLOAD_TIMEOUT_MS = 10;
  require.cache[fallbackPath] = {
    id: fallbackPath, filename: fallbackPath, loaded: true,
    exports: {
      downloadWithFallback: ({ signal }) => new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => resolve({ file: 'late' }), 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          sawAbort = true;
          reject(signal.reason);
        }, { once: true });
      }),
    },
  };
  try {
    const dl = freshDownloader();
    await assert.rejects(
      () => dl.downloadYoutubeAudio('https://youtube.com/watch?v=x', 'Track', undefined, 'test-owner'),
      /Overall request timeout exceeded/
    );
    assert.equal(sawAbort, true);
    assert.equal(queue.stats().active, 0);
  } finally {
    cfg.DOWNLOAD_TIMEOUT_MS = previousTimeout;
    if (original) require.cache[fallbackPath] = original;
    else delete require.cache[fallbackPath];
  }
});

test('legacy YouTube downloader rejects lookalike and internal URLs before fallback', async () => {
  const fallbackPath = require.resolve('../download/fallback');
  const original = require.cache[fallbackPath];
  let calls = 0;
  require.cache[fallbackPath] = {
    id: fallbackPath, filename: fallbackPath, loaded: true,
    exports: { downloadWithFallback: async () => { calls++; throw new Error('should not run'); } },
  };
  try {
    const dl = freshDownloader();
    await assert.rejects(() => dl.downloadYoutubeAudio('http://127.0.0.1/?youtube.com'), /not a supported YouTube URL/);
    await assert.rejects(() => dl.downloadYoutubeAudio('https://youtube.com.evil.example/watch?v=x'), /not a supported YouTube URL/);
    assert.equal(calls, 0);
  } finally {
    if (original) require.cache[fallbackPath] = original;
    else delete require.cache[fallbackPath];
  }
});

test('download connections reuse the validated public DNS address', async () => {
  const dns = require('node:dns').promises;
  const { Readable } = require('node:stream');
  const axiosPath = require.resolve('axios');
  const originalAxios = require.cache[axiosPath]?.exports;
  const originalLookup = dns.lookup;
  let dnsCalls = 0;
  dns.lookup = async () => {
    dnsCalls++;
    return [{ address: '93.184.216.34', family: 4 }];
  };
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: {
      get: async (_url, options) => {
        const lookup = options.httpsAgent.options.lookup;
        const pinned = await new Promise((resolve, reject) => {
          lookup('media.example', {}, (error, address, family) => error ? reject(error) : resolve({ address, family }));
        });
        assert.deepEqual(pinned, { address: '93.184.216.34', family: 4 });
        return { status: 200, headers: {}, data: Readable.from([Buffer.from('MEDIA')]) };
      },
    },
  };
  try {
    const dl = freshDownloader();
    const result = await dl.downloadBuffer('https://media.example/file.mp4', 1024);
    assert.equal(result.toString(), 'MEDIA');
    assert.equal(dnsCalls, 1, 'Axios used the pinned lookup instead of resolving again');
  } finally {
    dns.lookup = originalLookup;
    if (originalAxios === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = originalAxios;
    delete require.cache[require.resolve('../utils/downloader')];
  }
});

test('the advertised yt command exposes the hardened video pipeline', () => {
  const command = require('../commands/yt');
  assert.equal(command.name, 'yt');
  assert.ok(command.aliases.includes('ytvideo'));
  assert.equal(typeof command.execute, 'function');
});
