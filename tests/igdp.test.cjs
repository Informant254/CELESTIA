const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');

function load(mocks, fetchImpl, env = {}) {
  const filename = path.resolve(__dirname, '../commands/igdp.js');
  const nativeRequire = createRequire(filename);
  const module = { exports: {} };
  const requireMock = (id) => (Object.hasOwn(mocks, id) ? mocks[id] : id === '../utils/downloader' ? {} : nativeRequire(id));
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: requireMock, module, exports: module.exports, process: { env }, console: { error() {} },
    URL, encodeURIComponent, Buffer, AbortSignal, fetch: fetchImpl,
  }, { filename });
  return module.exports;
}

const sentinel = new AbortController().signal;

test('parseUsername handles plain handles and instagram profile links', () => {
  const igdp = load({}, undefined);
  const { parseUsername } = igdp.__internals;
  assert.equal(parseUsername(' @leomessi '), 'leomessi');
  assert.equal(parseUsername('https://www.instagram.com/ceo/?hl=en'), 'ceo');
  assert.equal(parseUsername('https://www.instagram.com/stories/ceo/123456/'), 'ceo');
  assert.throws(() => parseUsername('https://www.instagram.com/reel/CODE/'), /not a post or reel link/);
  assert.throws(() => parseUsername('https://facebook.com/ceo/'), /not an Instagram profile/);
  assert.throws(() => parseUsername('bad name!'), /letters, numbers, dots/);
  assert.equal(parseUsername('instagram.com/ceo'), 'ceo');
  assert.equal(parseUsername('https://l.instagram.com/?u=https%3A%2F%2Fwww.instagram.com%2Fceo%2F%3Ffbclid%3Dzz&e=ATtok'), 'ceo');
  assert.equal(parseUsername('https://www.instagram.com/@ceo/?hl=en'), 'ceo');
  assert.equal(parseUsername('https://www.instagram.com/riazzeii?obrf=MXg1ZHd0dHM3bmxlNw=='), 'riazzeii');
});

test('fetchProfilePicture prefers the keyless instagram api and falls back to the page og:image', async () => {
  const api = {
    leo: { ok: true, json: async () => ({ data: { user: { profile_pic_url: 'https://cdn/p.jpg', profile_pic_url_hd: 'https://cdn/hd.jpg', full_name: 'Leo', is_private: true } } }) },
  };
  let page;
  const igdp = load({}, async (url) => {
    if (url.includes('web_profile_info')) {
      const username = url.match(/username=([^&]+)/)[1];
      const response = api[username];
      if (!response) return { ok: false, status: 429 };
      return response;
    }
    if (url.includes('/embed/')) return { ok: false, status: 403 };
    const hit = page;
    page = null;
    if (!hit) throw new Error('unexpected page fetch');
    return hit;
  });

  const viaApi = await igdp.__internals.fetchProfilePicture('leo', sentinel);
  assert.equal(viaApi.url, 'https://cdn/hd.jpg');
  assert.equal(viaApi.private, true);
  assert.equal(viaApi.provider, 'instagram');

  page = { ok: true, text: async () => '<meta property="og:image" content="https://a.cdn/CN1?u=x&amp;w=1080" />' };
  const og = await igdp.__internals.fetchProfilePicture('og', sentinel);
  assert.equal(og.url, 'https://a.cdn/CN1?u=x&w=1080');
  assert.equal(og.provider, 'web');

});

function embedHtml(context) {
  // Instagram's embed is JS containing a JSON string containing profile JSON.
  return `<script>requireLazy([],function(){init({"contextJSON":${JSON.stringify(JSON.stringify({ context }))}});});</script>`;
}

test('rate-limited API and login-only pages fall back to the matching embedded profile', async () => {
  const calls = [];
  const igdp = load({}, async (url) => {
    calls.push(url);
    if (url.includes('web_profile_info')) return { ok: false, status: 429 };
    if (url.endsWith('/embed/')) return {
      ok: true, url,
      text: async () => embedHtml({ username: 'leomessi', full_name: 'Leo Messi', profile_pic_url: 'https://scontent.cdninstagram.com/avatar.jpg?a=1&b=2' }),
    };
    throw new Error('The working embed should stop further requests');
  });
  const result = await igdp.__internals.fetchProfilePicture('leomessi', sentinel);
  assert.equal(result.provider, 'embed');
  assert.equal(result.url, 'https://scontent.cdninstagram.com/avatar.jpg?a=1&b=2');
  assert.equal(calls.length, 2);
});

test('missing user data is not treated as a nonexistent account and HD-only profiles work', async () => {
  const igdp = load({}, async (url) => {
    if (url.includes('web_profile_info')) return { ok: true, json: async () => ({ status: 'fail', message: 'login_required' }) };
    return { ok: true, url, text: async () => embedHtml({ username: 'ceo', profile_pic_url_hd: 'https://scontent.cdninstagram.com/hd.jpg' }) };
  });
  const result = await igdp.__internals.fetchProfilePicture('ceo', sentinel);
  assert.equal(result.url, 'https://scontent.cdninstagram.com/hd.jpg');
  assert.equal(result.provider, 'embed');
});

test('embed extraction rejects another user and decodes JSON escaping without executing scripts', () => {
  const { embeddedProfile } = load({}, undefined).__internals;
  const context = { username: 'ceo', profile_pic_url: 'https://scontent.cdninstagram.com/p.jpg?token=%3D&x=2' };
  const html = embedHtml(context).replace(/%3D/, '\\\\u00253D');
  assert.equal(embeddedProfile(html, 'ceo').url, context.profile_pic_url);
  assert.equal(embeddedProfile(html, 'someone_else'), null);
  assert.equal(embeddedProfile('<script>throw new Error("do not execute")</script>', 'ceo'), null);
});

test('login redirects and the generic Instagram logo produce a retrieval error, never a missing-photo claim', async () => {
  for (const redirected of [true, false]) {
    const igdp = load({}, async (url) => {
      if (url.includes('web_profile_info')) return { ok: true, json: async () => null };
      if (url.endsWith('/embed/')) return { ok: true, url, text: async () => embedHtml({}) };
      return {
        ok: true, url: redirected ? 'https://www.instagram.com/accounts/login/' : url,
        text: async () => '<meta property="og:image" content="https://static.cdninstagram.com/rsrc.php/v4/logo.png">',
      };
    });
    await assert.rejects(igdp.__internals.fetchProfilePicture('riazzeii', sentinel), (error) => {
      assert.match(error.message, /did not allow this server to retrieve/);
      assert.doesNotMatch(error.message, /was not found|No profile picture was available/);
      return true;
    });
  }
});

test('aborted requests stop without trying other sources', async () => {
  const controller = new AbortController();
  let calls = 0;
  const igdp = load({}, async () => {
    calls++;
    controller.abort(new Error('cancelled'));
    throw controller.signal.reason;
  });
  await assert.rejects(igdp.__internals.fetchProfilePicture('ceo', controller.signal), /cancelled/);
  assert.equal(calls, 1);
});

test('profile requests stay keyless and never attach an Instagram cookie', async () => {
  const calls = [];
  const igdp = load({}, async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, 'https://www.instagram.com');
    assert.equal(options.headers?.cookie, undefined);
    assert.equal(options.headers?.['x-csrftoken'], undefined);
    assert.equal(options.redirect, 'manual');
    if (url.includes('web_profile_info')) return { ok: false, status: 302, headers: { location: 'https://other.example/login' } };
    return { ok: true, url, text: async () => embedHtml({ username: 'ceo', profile_pic_url: 'https://cdn/p.jpg' }) };
  }, { INSTAGRAM_COOKIE: 'sessionid=should-never-be-used' });
  const result = await igdp.__internals.fetchProfilePicture('ceo', sentinel);
  assert.equal(result.provider, 'embed');
  assert.equal(calls.length, 2);
});

test('execute sends the downloaded profile picture and reports status', async () => {
  const igdp = load(
    { '../utils/downloader': { downloadBuffer: async (url) => Buffer.from('pic:' + url), detectMediaType: () => 'image' } },
    async (url) => {
      if (url.includes('web_profile_info') && url.includes('username=ceo')) {
        return { ok: true, json: async () => ({ data: { user: { profile_pic_url: 'https://cdn/p.jpg', full_name: 'CEO' } } }) };
      }
      throw new Error('unexpected fetch');
    }
  );
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } };
  await igdp.execute(sock, { key: { remoteJid: 'chat' } }, ['ceo']);
  const image = sent.find((m) => m.image);
  assert.ok(image, 'an image message should be sent');
  assert.ok(Buffer.from(image.image).equals(Buffer.from('pic:https://cdn/p.jpg')));
  assert.match(image.caption, /@ceo|CEO/);
  assert.ok(sent.some((m) => m.text === '✅ Done!' && m.edit));
});

test('execute refuses HTML returned by an image download', async () => {
  const igdp = load({ '../utils/downloader': {
    downloadBuffer: async () => Buffer.from('<html>Login required</html>'),
    detectMediaType: () => null,
  } }, async () => ({ ok: true, json: async () => ({ data: { user: { profile_pic_url: 'https://cdn/p.jpg' } } }) }));
  const sent = [];
  await igdp.execute({ sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } }, { key: { remoteJid: 'chat' } }, ['ceo']);
  assert.equal(sent.some((message) => message.image), false);
  assert.ok(sent.some((message) => message.text?.includes('page instead of an image')));
});

test('execute reports a friendly hint for invalid input', async () => {
  const igdp = load({ '../utils/downloader': {} }, undefined);
  const sent = [];
  const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: 'k' }; } };
  await igdp.execute(sock, { key: { remoteJid: 'chat' } }, ['https://facebook.com/ceo/']);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /not an Instagram profile/);
});
