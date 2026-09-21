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

test('audio fallback tries SoundCloud before direct APIs', async () => {
  const ytdlpPath = require.resolve('../download/ytdlp');
  const ffmpegPath = require.resolve('../download/ffmpeg');
  const apiPath = require.resolve('../utils/downloader');
  const fallbackPath = require.resolve('../download/fallback');
  const originals = new Map([ytdlpPath, ffmpegPath, apiPath, fallbackPath].map((p) => [p, require.cache[p]]));
  const calls = [];
  require.cache[ytdlpPath] = { id: ytdlpPath, filename: ytdlpPath, loaded: true, exports: {
    attempt: async ({ url }) => {
      calls.push(url);
      if (!String(url).startsWith('scsearch10:')) throw new Error('youtube blocked');
      return { file: '/tmp/sc.mp3', size: 10 };
    },
  } };
  require.cache[ffmpegPath] = { id: ffmpegPath, filename: ffmpegPath, loaded: true, exports: {
    streams: async () => [{ codec_type: 'audio' }],
    probe: async () => ({ size: 10, duration: 180 }),
  } };
  require.cache[apiPath] = { id: apiPath, filename: apiPath, loaded: true, exports: { ytAudio: async () => { throw new Error('API should not run'); } } };
  const fs = require('node:fs');
  const exists = fs.existsSync;
  const stat = fs.statSync;
  fs.existsSync = (p) => p === '/tmp/sc.mp3' || exists(p);
  fs.statSync = (p) => p === '/tmp/sc.mp3' ? { size: 10 } : stat(p);
  delete require.cache[fallbackPath];
  try {
    const fallback = require('../download/fallback');
    const result = await fallback.downloadWithFallback({
      url: 'https://youtube.com/watch?v=x', title: 'Artist - Song', isAudio: true, workDir: '/tmp', maxBytes: 100,
    });
    assert.equal(result.strategy, 'soundcloud-search');
    assert.equal(calls.at(-1), 'scsearch10:Artist Song');
  } finally {
    fs.existsSync = exists;
    fs.statSync = stat;
    for (const [p, cached] of originals) cached ? require.cache[p] = cached : delete require.cache[p];
  }
});

test('SoundCloud fallback requires artist-owned original recording', () => {
  const fallback = require('../download/fallback');
  const plan = fallback.soundcloudPlan('Adele - Hello (Official Music Video)');
  assert.equal(plan.url, 'scsearch10:Adele Hello');
  assert.match(plan.filter, /uploader ~= \(\?i\)Adele/);
  assert.match(plan.filter, /title ~= \(\?i\)Hello/);
  assert.match(plan.filter, /cover\|remix\|karaoke/);
  assert.equal(fallback.soundcloudPlan('hello'), null, 'ambiguous title is not guessed');
});
