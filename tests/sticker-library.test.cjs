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
const previousImports = settingsStore.get(library.IMPORT_KEY, undefined);

after(() => {
  settingsStore.set(library.ENABLED_KEY, previous === undefined ? {} : previous);
  settingsStore.set(library.IMPORT_KEY, previousImports === undefined ? {} : previousImports);
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

test('pack imports track progress and close automatically at their limit', () => {
  const chat = 'pack@s.whatsapp.net';
  const started = library.startImport(chat, 'Funny Pack', 3);
  assert.equal(started.pack, 'funnypack');
  assert.equal(library.getImport(chat).count, 0);
  assert.equal(library.advanceImport(chat).complete, false);
  assert.equal(library.advanceImport(chat).count, 2);
  const completed = library.advanceImport(chat);
  assert.equal(completed.complete, true);
  assert.equal(completed.count, 3);
  assert.equal(library.getImport(chat), null);
});

test('pack import can finish early without deleting saved stickers', () => {
  const chat = 'early@s.whatsapp.net';
  library.startImport(chat, 'love', 60);
  library.advanceImport(chat);
  const finished = library.finishImport(chat);
  assert.equal(finished.pack, 'love');
  assert.equal(finished.count, 1);
  assert.equal(library.getImport(chat), null);
});
