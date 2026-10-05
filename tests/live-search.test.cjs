const { test } = require('node:test');
const assert = require('node:assert/strict');

function freshSearch() {
  delete require.cache[require.resolve('../utils/liveSearch')];
  return require('../utils/liveSearch');
}

function stubAxios(handler) {
  const axiosPath = require.resolve('axios');
  const orig = require.cache[axiosPath]?.exports;
  require.cache[axiosPath] = {
    id: axiosPath, filename: axiosPath, loaded: true,
    exports: { get: handler },
  };
  return () => {
    if (orig === undefined) delete require.cache[axiosPath];
    else require.cache[axiosPath].exports = orig;
  };
}

test('live search takes the first instance with real results', async () => {
  const calls = [];
  const restore = stubAxios(async (url, opts) => {
    calls.push(url);
    if (url.startsWith('https://first.test')) throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
    return { data: { results: [{ title: 'T', url: 'https://example.com/a', content: 'snippet here' }] } };
  });
  const prev = process.env.SEARXNG_URL;
  process.env.SEARXNG_URL = 'https://first.test';
  try {
    const ls = freshSearch();
    const r = await ls.searchWeb('hello world', 5);
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].title, 'T');
    assert.equal(r.results[0].snippet, 'snippet here');
    assert.ok(calls.length >= 2, 'own instance first, then rotation');
    assert.ok(calls[0].startsWith('https://first.test'), 'SEARXNG_URL goes first');
  } finally {
    if (prev === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = prev;
    restore();
  }
});

test('live search skips non-JSON and empty instances', async () => {
  const restore = stubAxios(async () => ({ data: '<html>no json here</html>' }));
  try {
    const ls = freshSearch();
    await assert.rejects(() => ls.searchWeb('query', 3), /offline/);
  } finally {
    restore();
  }
});

test('live search rejects empty queries and bad URLs', async () => {
  const ls = freshSearch();
  await assert.rejects(() => ls.searchWeb('   '), /Empty/);
  const restore = stubAxios(async () => ({
    data: { results: [{ title: 'x', url: 'ftp://evil.test/f', content: 'y' }, { title: '', url: 'https://ok.test/', content: '' }] },
  }));
  try {
    const fresh = freshSearch();
    const out = await fresh.queryInstance('https://i.test', 'q', 5);
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://ok.test/');
  } finally {
    restore();
  }
});

test('search command is registered with free aliases', () => {
  const cmd = require('../commands/search');
  assert.equal(cmd.name, 'search');
  assert.ok(cmd.aliases.includes('web'));
  assert.ok(cmd.aliases.includes('google'));
});

test('brave API wins when a key is set and returns results', async () => {
  const calls = [];
  const restore = stubAxios(async (url) => {
    calls.push(url);
    if (!url.includes('brave.com')) throw Object.assign(new Error('unreached'), { code: 'ECONNREFUSED' });
    return { data: { web: { results: [{ title: 'Brave hit', url: 'https://example.com/b', description: 'brave snippet' }] } } };
  });
  const prev = process.env.BRAVE_SEARCH_KEY;
  process.env.BRAVE_SEARCH_KEY = 'test-key';
  try {
    const ls = freshSearch();
    const r = await ls.searchWeb('hello world', 5);
    assert.equal(r.instance, 'brave');
    assert.equal(r.results[0].title, 'Brave hit');
    assert.equal(r.results[0].snippet, 'brave snippet');
    assert.equal(calls.length, 1, 'no SearXNG rotation when Brave answers');
  } finally {
    if (prev === undefined) delete process.env.BRAVE_SEARCH_KEY;
    else process.env.BRAVE_SEARCH_KEY = prev;
    restore();
  }
});

test('brave failure falls through to SearXNG rotation', async () => {
  const restore = stubAxios(async (url) => {
    if (url.includes('brave.com')) throw Object.assign(new Error('bad key'), { response: { status: 401 } });
    return { data: { results: [{ title: 'S', url: 'https://example.com/s', content: 'x' }] } };
  });
  const prev = process.env.BRAVE_SEARCH_KEY;
  process.env.BRAVE_SEARCH_KEY = 'bad-key';
  try {
    const ls = freshSearch();
    const r = await ls.searchWeb('hello world', 5);
    assert.notEqual(r.instance, 'brave');
    assert.equal(r.results[0].title, 'S');
  } finally {
    if (prev === undefined) delete process.env.BRAVE_SEARCH_KEY;
    else process.env.BRAVE_SEARCH_KEY = prev;
    restore();
  }
});

test('queryBrave stays silent without a key', async () => {
  const prev = process.env.BRAVE_SEARCH_KEY;
  const prev2 = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  try {
    const ls = freshSearch();
    assert.equal(await ls.queryBrave('q', 5), null);
  } finally {
    if (prev !== undefined) process.env.BRAVE_SEARCH_KEY = prev;
    if (prev2 !== undefined) process.env.BRAVE_SEARCH_API_KEY = prev2;
  }
});

test('freshness intent selects day and week news modes without affecting normal searches', () => {
  const ls = freshSearch();
  for (const query of [
    'Nairobi gossip trending news today',
    'latest Kenya headlines',
    'what is currently breaking',
    'recent technology news',
    'updates from just now',
  ]) {
    assert.deepEqual(ls.detectSearchIntent(query), {
      mode: 'NEWS', timeRange: 'day', freshnessMs: 24 * 60 * 60 * 1000,
    });
  }
  assert.equal(ls.detectSearchIntent('Kenya news this week').timeRange, 'week');
  assert.equal(ls.detectSearchIntent('stories from the past 7 days').timeRange, 'week');
  assert.equal(ls.detectSearchIntent('how to configure nginx').mode, 'WEB');
  assert.equal(ls.detectSearchIntent('current Node.js version').mode, 'WEB');
  assert.equal(ls.detectSearchIntent('weather today').mode, 'WEB');
  assert.equal(ls.detectSearchIntent('Nairobi stories yesterday').freshnessMs, 48 * 60 * 60 * 1000);
});

test('news query rewriting preserves intent while clarifying Nairobi gossip searches', () => {
  const ls = freshSearch();
  assert.equal(
    ls.rewriteNewsQuery('Nairobi gossip trending news today'),
    'Nairobi trending entertainment news Kenya today'
  );
  assert.equal(
    ls.rewriteNewsQuery('Nairobi gossip stories this week'),
    'Nairobi trending entertainment news Kenya this week'
  );
  assert.equal(ls.rewriteNewsQuery('latest JavaScript news'), 'latest JavaScript news');
});

test('news mode sends category, time range, language, format, and safe search to SearXNG', async () => {
  let params;
  const restore = stubAxios(async (_url, options) => {
    params = options.params;
    return { data: { results: [] } };
  });
  try {
    const ls = freshSearch();
    await ls.queryInstance('https://search.test', 'breaking today', 20, { mode: 'NEWS', timeRange: 'day' });
    assert.deepEqual(params, {
      q: 'breaking today',
      format: 'json',
      language: 'en',
      categories: 'news',
      time_range: 'day',
      safesearch: '1',
    });
  } finally {
    restore();
  }
});

test('news ranking rejects stale dates and profiles, prefers articles, and removes duplicates', () => {
  const ls = freshSearch();
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const stale = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const input = [
    { title: 'Home - Nairobi Gossip Club', url: 'https://nairobigossipclub.co.ke/', snippet: 'Homepage', source: 'nairobigossipclub.co.ke', publishedAt: null },
    { title: 'Nairobi Gossip Club profile', url: 'https://facebook.com/nairobigossipclub', snippet: 'Profile page', source: 'facebook.com', publishedAt: hourAgo },
    { title: 'The Star Kenya - YouTube', url: 'https://youtube.com/channel/example', snippet: 'Video channel', source: 'youtube.com', publishedAt: hourAgo },
    { title: 'Singer launches new Nairobi album today', url: 'https://nairobigossipclub.co.ke/2026/10/singer-launches-new-nairobi-album', snippet: 'A detailed and current entertainment report from Nairobi published this morning.', source: 'nairobigossipclub.co.ke', publishedAt: hourAgo },
    { title: 'Singer launches new Nairobi album today', url: 'https://nairobigossipclub.co.ke/2026/10/singer-launches-new-nairobi-album?utm_source=x', snippet: 'Duplicate', source: 'nairobigossipclub.co.ke', publishedAt: hourAgo },
    { title: 'Old entertainment report', url: 'https://example.com/news/old-report', snippet: 'Old report', source: 'example.com', publishedAt: stale },
    { title: 'Nairobi celebrity stories from 2025', url: 'https://example.com/news/archive', snippet: 'A 2025 roundup', source: 'example.com', publishedAt: null },
  ];
  const intent = ls.detectSearchIntent('Nairobi gossip trending news today');
  const ranked = ls.rankNewsResults(input, intent, 'Nairobi gossip trending news today', 5, now);
  assert.equal(ranked.length, 1);
  assert.match(ranked[0].url, /singer-launches-new-nairobi-album/);
});

test('news ranking retains a homepage only when no direct article survives', () => {
  const ls = freshSearch();
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const ranked = ls.rankNewsResults([
    { title: 'News home', url: 'https://example.com/', snippet: 'Current headlines', source: 'example.com', publishedAt: null },
    { title: 'Social profile', url: 'https://instagram.com/example', snippet: 'Posts', source: 'instagram.com', publishedAt: null },
  ], ls.detectSearchIntent('latest news today'), 'latest news today', 5, now);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].url, 'https://example.com/');
});

test('news ranking does not mistake author and category listings for articles', () => {
  const ls = freshSearch();
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const recent = new Date(now - 60 * 60 * 1000).toISOString();
  const ranked = ls.rankNewsResults([
    { title: 'Politics category', url: 'https://example.com/category/politics', snippet: 'Listing', source: 'example.com', publishedAt: recent },
    { title: 'Reporter archive', url: 'https://example.com/author/jane', snippet: 'Archive', source: 'example.com', publishedAt: recent },
    { title: 'Parliament passes a new bill today', url: 'https://example.com/news/parliament-passes-new-bill-today', snippet: 'A detailed report about the newly passed bill.', source: 'example.com', publishedAt: recent },
  ], ls.detectSearchIntent('latest politics news'), 'latest politics news', 5, now);
  assert.equal(ranked.length, 1);
  assert.match(ranked[0].url, /parliament-passes/);
});

test('news deduplication keeps materially different follow-up headlines', () => {
  const ls = freshSearch();
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  const recent = new Date(now - 60 * 60 * 1000).toISOString();
  const ranked = ls.rankNewsResults([
    { title: 'President signs tax bill', url: 'https://example.com/news/president-signs-tax-bill', snippet: 'First report with details.', source: 'example.com', publishedAt: recent },
    { title: 'President signs tax bill after court ruling changes implementation', url: 'https://example.com/news/tax-bill-after-court-ruling', snippet: 'A distinct follow-up with new details.', source: 'example.com', publishedAt: recent },
  ], ls.detectSearchIntent('latest political news'), 'latest political news', 5, now);
  assert.equal(ranked.length, 2);
});

test('weak news results trigger general fallback while stale results stay excluded', async () => {
  const calls = [];
  const now = Date.now();
  const restore = stubAxios(async (_url, options) => {
    calls.push(options.params);
    if (options.params.categories === 'news') {
      return { data: { results: [{
        title: 'Old headline',
        url: 'https://example.com/2025/old-headline',
        content: 'Old',
        publishedDate: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }] } };
    }
    return { data: { results: [{
      title: 'Current Nairobi entertainment report',
      url: 'https://reuters.com/world/africa/current-nairobi-entertainment-report',
      content: 'A current and detailed report from Nairobi with the latest developments.',
      publishedDate: new Date(now - 30 * 60 * 1000).toISOString(),
    }] } };
  });
  const previous = process.env.SEARXNG_URL;
  process.env.SEARXNG_URL = 'https://own.test';
  try {
    const ls = freshSearch();
    const result = await ls.searchWeb('Nairobi trending news today', 5);
    assert.equal(result.mode, 'NEWS');
    assert.equal(result.usedFallback, true);
    assert.equal(result.results.length, 1);
    assert.match(result.results[0].title, /Current Nairobi/);
    assert.ok(calls.some((params) => params.categories === 'news'));
    assert.ok(calls.some((params) => params.categories === undefined));
  } finally {
    if (previous === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = previous;
    restore();
  }
});

test('stale Brave news falls through to fresh SearXNG results', async () => {
  const calls = [];
  const now = Date.now();
  const restore = stubAxios(async (url) => {
    calls.push(url);
    if (url.includes('brave.com')) {
      return { data: { web: { results: [{
        title: 'Old Brave report',
        url: 'https://example.com/news/old-brave-report',
        description: 'Old result',
        page_age: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
      }] } } };
    }
    return { data: { results: [{
      title: 'Fresh SearXNG report today',
      url: 'https://reuters.com/world/africa/fresh-searxng-report-today',
      content: 'A fresh report with current details from a reliable source.',
      publishedDate: new Date(now - 20 * 60 * 1000).toISOString(),
    }] } };
  });
  const previousKey = process.env.BRAVE_SEARCH_KEY;
  const previousUrl = process.env.SEARXNG_URL;
  process.env.BRAVE_SEARCH_KEY = 'test-key';
  process.env.SEARXNG_URL = 'https://own.test';
  try {
    const ls = freshSearch();
    const result = await ls.searchWeb('latest Kenya news', 1);
    assert.equal(result.results[0].title, 'Fresh SearXNG report today');
    assert.ok(calls.some((url) => url.includes('brave.com')));
    assert.ok(calls.some((url) => url.startsWith('https://own.test')));
  } finally {
    if (previousKey === undefined) delete process.env.BRAVE_SEARCH_KEY;
    else process.env.BRAVE_SEARCH_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.SEARXNG_URL;
    else process.env.SEARXNG_URL = previousUrl;
    restore();
  }
});

test('news formatter reports source, publication age, summary, and direct link', () => {
  const command = require('../commands/search');
  const text = command.formatSearchResponse('latest Nairobi news', {
    mode: 'NEWS',
    results: [{
      title: 'A real article headline',
      source: 'example.com',
      publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      snippet: 'Article summary.',
      url: 'https://example.com/news/real-article',
    }],
  });
  assert.match(text, /A real article headline/);
  assert.match(text, /\*Source:\* example\.com/);
  assert.match(text, /\*Published:\* 2 hours ago/);
  assert.match(text, /\*Summary:\* Article summary\./);
  assert.match(text, /\*Link:\* https:\/\/example\.com\/news\/real-article/);
});

test('publication age formatter uses singular units', () => {
  const ls = freshSearch();
  const now = Date.UTC(2026, 9, 5, 12, 0, 0);
  assert.equal(ls.formatPublishedDate(new Date(now - 60_000).toISOString(), now), '1 minute ago');
  assert.equal(ls.formatPublishedDate(new Date(now - 3_600_000).toISOString(), now), '1 hour ago');
});
