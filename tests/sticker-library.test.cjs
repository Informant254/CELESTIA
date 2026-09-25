const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-stickers-'));
process.env.STICKER_LIBRARY_DIR = root;
const settingsStore = require('../utils/settingsStore');
const library = require('../autochat/stickerLibrary');
const previous = settingsStore.get(library.ENABLED_KEY, undefined);

after(() => {
  settingsStore.set(library.ENABLED_KEY, previous === undefined ? {} : previous);
  fs.rmSync(root, { recursive: true, force: true });
});

test('saved stickers deduplicate and retain their mood', () => {
  const first = library.add(Buffer.from('fake-webp-one'), 'Happy!');
  const second = library.add(Buffer.from('fake-webp-one'), 'love');
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(library.list().length, 1);
  assert.equal(library.list()[0].mood, 'love');
  assert.deepEqual(library.pick('love', () => 0).buffer, Buffer.from('fake-webp-one'));
});

test('mood detection selects an available matching pack', () => {
  library.add(Buffer.from('fake-webp-two'), 'sad');
  assert.equal(library.detectMood('I feel sad and lonely today'), 'sad');
  assert.equal(library.detectMood('I love you so much'), 'love');
});

test('autosticker is opt-in and explicit requests bypass chance', () => {
  const chat = '123@s.whatsapp.net';
  library.setEnabled(chat, true);
  assert.equal(library.isEnabled(chat), true);
  assert.equal(library.shouldSend(chat, 'please send a sticker now', '', () => 0.99, 1000), true);
  assert.equal(library.shouldSend('off@s.whatsapp.net', 'send sticker', '', () => 0, 1000), false);
});

test('stickers can be removed by displayed number', () => {
  const before = library.list().length;
  const removed = library.remove('1');
  assert.ok(removed);
  assert.equal(library.list().length, before - 1);
});
