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
