const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

function load(relative, mocks = {}, env = {}) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : native(id),
    process: { env }, Buffer, URL, setTimeout, clearTimeout,
  }, { filename });
  return module.exports;
}

function jar(value = 'fixture', expiry = Math.floor(Date.now() / 1000) + 86400) {
  return `# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t${expiry}\tSID\t${value}\n`;
}

function setup(t, fetchFile, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-cookie-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'youtube.txt');
  const cookies = load('../download/cookies.js', {
    '../utils/downloader': { downloadBuffer: fetchFile || (async () => { throw new Error('no source'); }) },
  }, { YOUTUBE_COOKIES_FILE: file, ...extra });
  return { cookies, file, dir };
}

test('cookie parser handles HttpOnly exports, session cookies and expiry without exposing values', t => {
  const { cookies } = setup(t);
  assert.equal(cookies.parseJar(jar()).usable, true);
  assert.equal(cookies.parseJar(jar('session', 0)).expiresAt, null);
  assert.equal(cookies.parseJar(jar('expired', 1)).usable, false);
  assert.throws(() => cookies.parseJar('SID=secret-value'), error => !error.message.includes('secret-value'));
  assert.throws(() => cookies.parseJar(jar().replace('.youtube.com', '.unrelated.example')), /no signed-in/);
});

test('fresh replacements are validated, atomically installed and picked up without restarting', async t => {
  let remote = jar('first');
  const { cookies, file } = setup(t, async () => Buffer.from(remote), { YOUTUBE_COOKIES_URL: 'https://owner.example/private-cookies.txt' });
  await cookies.prepare();
  assert.equal(cookies.cookieFile(), file);
  const old = cookies.inspect().hash;
  cookies.reject(old);
  assert.equal(cookies.cookieFile(), null);
  // An owner upload supersedes a rejected jar without waiting for a redeploy.
  await cookies.store(jar('new-upload'));
  assert.equal(cookies.cookieFile(), file);
  assert.notEqual(cookies.inspect().hash, old);
  assert.doesNotMatch(JSON.stringify(cookies.status()), /new-upload|owner\.example/);
});

test('invalid or expired remote replacements preserve the existing good file', async t => {
  const { cookies, file } = setup(t, async () => Buffer.from('<html>login</html>'), { YOUTUBE_COOKIES_URL: 'https://owner.example/file?token=private' });
  await cookies.store(jar('keep-this'));
  const result = await cookies.refresh({ force: true });
  assert.equal(result.failed, true);
  assert.match(fs.readFileSync(file, 'utf8'), /keep-this/);
  assert.doesNotMatch(JSON.stringify(cookies.status()), /token|private|keep-this/);
});

test('simultaneous refreshes are coalesced and unchanged rejected jars are not reused', async t => {
  let calls = 0;
  const content = jar('unchanged');
  const { cookies } = setup(t, async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Buffer.from(content); }, {
    YOUTUBE_COOKIES_URL: 'https://owner.example/cookies.txt',
  });
  await cookies.store(content);
  cookies.reject(cookies.inspect().hash);
  await Promise.all([cookies.refresh({ force: true }), cookies.refresh({ force: true })]);
  assert.equal(calls, 1);
  assert.equal(cookies.status().state, 'rejected');
  assert.equal(cookies.cookieFile(), null);
  await cookies.refresh({ force: true });
  assert.equal(calls, 1, 'cooldown prevents repeated source requests');
});

test('an in-flight refresh cannot overwrite a newer manual upload', async t => {
  let release;
  const { cookies, file } = setup(t, () => new Promise(resolve => { release = () => resolve(Buffer.from(jar('remote-old'))); }), {
    YOUTUBE_COOKIES_URL: 'https://owner.example/cookies.txt',
  });
  await cookies.store(jar('original'));
  const pending = cookies.refresh({ force: true });
  await cookies.store(jar('manual-new'));
  release();
  await pending;
  assert.match(fs.readFileSync(file, 'utf8'), /manual-new/);
});

test('yt-dlp cookie snapshots are isolated and session updates do not clobber a newer upload', async t => {
  const { cookies, file, dir } = setup(t);
  await cookies.store(jar('original'));
  const work = path.join(dir, 'job');
  fs.mkdirSync(work);
  const snapshot = cookies.snapshot(work);
  assert.notEqual(snapshot.file, file);
  fs.writeFileSync(snapshot.file, jar('yt-updated'));
  await cookies.saveUpdated(snapshot);
  assert.match(fs.readFileSync(file, 'utf8'), /yt-updated/);
  const second = cookies.snapshot(work);
  await cookies.store(jar('owner-upload'));
  fs.writeFileSync(second.file, jar('stale-job-update'));
  await cookies.saveUpdated(second);
  assert.match(fs.readFileSync(file, 'utf8'), /owner-upload/);
});

test('yt-dlp retries once with genuinely new cookies after an authentication failure', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-cookie-retry-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let count = 0;
  let refreshed = false;
  let rejected;
  const cookies = {
    prepare: async () => {},
    snapshot: () => ({ file: path.join(dir, 'youtube-cookies.txt'), hash: refreshed ? 'new' : 'old' }),
    authFailure: error => /Sign in/.test(error.message),
    reject: hash => rejected = hash,
    refresh: async () => { refreshed = true; },
    saveUpdated: async () => {},
  };
  const ytdlp = load('../download/ytdlp.js', {
    './cookies': cookies,
    './engines': { ensureYtDlp: async () => 'yt-dlp', ensureYtDlpTools: async () => '/ffmpeg', aria2cPath: async () => null },
    child_process: { spawn: (bin, args) => {
      count++;
      assert.ok(args.includes('--cookies'));
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
      setImmediate(() => {
        if (count === 1) { child.stderr.emit('data', 'Sign in to confirm you are not a bot'); child.emit('close', 1); }
        else { fs.writeFileSync(path.join(dir, 'out.mp4'), 'media'); child.emit('close', 0); }
      });
      return child;
    } },
  });
  const result = await ytdlp.attempt({ url: 'https://youtube.com/watch?v=fixture', selector: 'best', workDir: dir });
  assert.equal(count, 2);
  assert.equal(rejected, 'old');
  assert.equal(result.size, 5);
});

test('unchanged cookies do not cause an authentication retry loop', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-cookie-no-loop-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let count = 0;
  const ytdlp = load('../download/ytdlp.js', {
    './cookies': {
      prepare: async () => {}, snapshot: () => ({ file: 'cookie-file', hash: 'unchanged' }),
      authFailure: () => true, reject() {}, refresh: async () => {}, saveUpdated: async () => {},
    },
    './engines': { ensureYtDlp: async () => 'yt-dlp', ensureYtDlpTools: async () => '/ffmpeg', aria2cPath: async () => null },
    child_process: { spawn: () => {
      count++;
      const child = new EventEmitter();
      child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
      setImmediate(() => { child.stderr.emit('data', 'Sign in required'); child.emit('close', 1); });
      return child;
    } },
  });
  await assert.rejects(ytdlp.attempt({ url: 'https://youtube.com/watch?v=fixture', selector: 'best', workDir: dir }), /Sign in/);
  assert.equal(count, 1);
});

test('cookie management command rejects non-owners and group uploads before fetching credentials', async () => {
  for (const [owner, jid] of [[false, 'person@s.whatsapp.net'], [true, 'group@g.us']]) {
    let text;
    const command = load('../commands/ytcookies.js', {
      '../utils/isOwner': { isOwner: () => owner },
      '../download/cookies': {},
    });
    await command.execute({ sendMessage: async (_, message) => { text = message.text; } }, { key: { remoteJid: jid } }, ['upload']);
    assert.match(text, owner ? /private chat/ : /Only the bot owner/);
  }
});

test('owner uploads are streamed, bounded and stored without echoing credentials', async () => {
  let stored;
  const messages = [];
  const content = jar('never-echo-this');
  const command = load('../commands/ytcookies.js', {
    '../utils/isOwner': { isOwner: () => true },
    '../download/cookies': { MAX_BYTES: 256 * 1024, status: () => ({}), store: async value => { stored = value.toString(); } },
    '@whiskeysockets/baileys': {
      normalizeMessageContent: value => value,
      downloadMediaMessage: async (message, type) => {
        assert.equal(type, 'stream');
        return (async function* () { yield Buffer.from(content); })();
      },
    },
  });
  await command.execute({ sendMessage: async (_, message) => { messages.push(message.text); } }, {
    key: { remoteJid: 'owner@s.whatsapp.net' },
    message: { extendedTextMessage: { contextInfo: { stanzaId: 'document', quotedMessage: { documentMessage: { fileLength: content.length } } } } },
  }, ['upload']);
  assert.equal(stored, content);
  assert.doesNotMatch(messages.join('\n'), /never-echo-this/);
  assert.match(messages.join('\n'), /no restart/);
});

test('shared readers use replacements immediately but cannot modify the shared jar', async t => {
  let downloads = 0;
  const { cookies, file, dir } = setup(t, async () => { downloads++; return Buffer.from(jar('remote')); }, {
    YOUTUBE_COOKIES_SHARED: 'true', YOUTUBE_COOKIES_READ_ONLY: 'true',
    YOUTUBE_COOKIES_URL: 'https://owner.example/source',
  });
  fs.writeFileSync(file, jar('first-upload'));
  const first = cookies.inspect().hash;
  const work = path.join(dir, 'job');
  fs.mkdirSync(work);
  const snapshot = cookies.snapshot(work);
  assert.equal(cookies.cookieFile(), file);
  await assert.rejects(cookies.store(jar('unauthorized-replacement')), /managed by the main bot/);
  fs.writeFileSync(snapshot.file, jar('job-update'));
  await cookies.saveUpdated(snapshot);
  assert.match(fs.readFileSync(file, 'utf8'), /first-upload/);
  await cookies.refresh({ force: true });
  assert.equal(downloads, 0);
  fs.writeFileSync(file, jar('replacement-from-main'));
  assert.notEqual(cookies.inspect().hash, first);
  assert.equal(cookies.status().shared, true);
  assert.equal(cookies.status().readOnly, true);
});

test('shared reader commands direct the owner to CELESTIA before downloading an upload', async () => {
  let text;
  const command = load('../commands/ytcookies.js', {
    '../utils/isOwner': { isOwner: () => true },
    '../download/cookies': { status: () => ({ shared: true, readOnly: true }) },
  });
  await command.execute({ sendMessage: async (_, message) => { text = message.text; } }, { key: { remoteJid: 'owner@s.whatsapp.net' } }, ['upload']);
  assert.match(text, /main CELESTIA bot/);
});

test('private fleets select their supported challenge runtime without changing the bot runtime', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-js-runtime-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runtime = path.join(dir, 'node22');
  fs.writeFileSync(runtime, 'runtime-path-fixture');
  const ytdlp = load('../download/ytdlp.js', { './cookies': { cookieFile: () => null } }, {
    YOUTUBE_COOKIES_SHARED: 'true', YOUTUBE_COOKIES_FILE: path.join(dir, 'youtube-cookies.txt'),
  });
  const args = ytdlp.baseArgs(dir, '/ffmpeg');
  assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${runtime}`);
});
