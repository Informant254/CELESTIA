const { test } = require('node:test');
const assert = require('node:assert/strict');
const memory = require('../autochat/memory');
const human = require('../autochat/humanizer');
const persona = require('../autochat/persona');

test('the current incoming message appears once, not twice', () => {
  const chatId = 'human-test@s.whatsapp.net';
  memory.clear(chatId);
  memory.push(chatId, 'them', 'unique incoming thought');
  const built = persona.build({ chatId, incoming: 'unique incoming thought', pushName: 'Owner', contactName: 'Friend' });
  assert.equal((built.user.match(/unique incoming thought/g) || []).length, 1);
  memory.clear(chatId);
});

test('human timing is brisk and capped after provider latency', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(human.readDelayMs(500) <= 2800);
    assert.ok(human.typeDelayMs(1000) <= 8000);
    assert.ok(human.typeDelayMs(3) >= 450);
  }
});

test('long unpunctuated replies split into phone-sized bubbles', () => {
  const text = 'word '.repeat(60).trim();
  const parts = human.chunk(text);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every(Boolean));
});
