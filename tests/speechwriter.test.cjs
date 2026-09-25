const { test } = require('node:test');
const assert = require('node:assert/strict');
const speechwriter = require('../commands/speechwriter');

test('long speeches are split without losing text', () => {
  const source = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}: ${'word '.repeat(55).trim()}`).join('\n\n');
  const parts = speechwriter._splitSpeech(source, 500);
  assert.ok(parts.length > 1, 'long output is chunked');
  assert.ok(parts.every((part) => part.length <= 500), 'every part fits');
  assert.equal(parts.join('\n\n'), source, 'all paragraphs survive in order');
});

test('short speech remains one message', () => {
  assert.deepEqual(speechwriter._splitSpeech('Opening.\n\nClosing.'), ['Opening.\n\nClosing.']);
});
