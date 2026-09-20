const { test } = require('node:test');
const assert = require('node:assert/strict');
const studio = require('../utils/mediaStudio');
const faceless = require('../commands/faceless');

test('creator cards escape XML-sensitive user text', () => {
  assert.equal(studio.escapeXml(`A&B <C> "D" 'E'`), 'A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;');
});

test('creator text wrapping is bounded and preserves useful text', () => {
  const lines = studio.wrapText('Celestia turns a simple thought into a beautiful status card for everyone', 18, 4);
  assert.ok(lines.length <= 4);
  assert.ok(lines.every((line) => line.length <= 18));
  assert.match(lines.join(' '), /Celestia/);
});

test('faceless plans accept bounded JSON and reject oversized scene lists', () => {
  const raw = JSON.stringify({ title: 'Focus', scenes: Array.from({ length: 8 }, (_, i) => ({ caption: `Step ${i}`, narration: `Narration ${i}`, imagePrompt: `Image ${i}` })) });
  const plan = faceless._internals.parsePlan(raw, 'focus');
  assert.equal(plan.scenes.length, 4);
  assert.equal(plan.title, 'Focus');
});

test('invalid faceless plans receive a deterministic three-scene fallback', () => {
  const plan = faceless._internals.parsePlan('not json', 'building confidence');
  assert.equal(plan.scenes.length, 3);
  assert.equal(plan.title, 'building confidence');
});
