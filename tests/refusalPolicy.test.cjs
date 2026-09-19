const { test } = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../autochat/refusalPolicy');
const persona = require('../autochat/persona');

test('refusal list is narrow, explicit, and non-negotiable', () => {
  assert.ok(policy.REFUSE.length >= 6, 'refuse list must be explicit');
  const joined = policy.REFUSE.join(' ').toLowerCase();
  assert.ok(joined.includes('minors'), 'minor safety is non-negotiable');
  assert.ok(joined.includes('non-consensual'), 'consent boundary is explicit');
});

test('benign targets are allow-listed, not refused', () => {
  const joined = policy.ALLOW.join(' ').toLowerCase();
  for (const topic of ['dating', 'roast', 'slang', 'persuasive']) {
    assert.ok(joined.includes(topic), `allow list must cover: ${topic}`);
  }
});

test('persona and speechwriter both carry the same contract', () => {
  const { system } = persona.build({ chatId: 't', incoming: 'hey', pushName: 'Boss', contactName: 'a friend' });
  assert.ok(system.includes('REFUSE ONLY'), 'persona carries the contract');
  assert.ok(system.includes('give me a chance'), 'dating appeals explicitly allowed in chat');
  assert.ok(!system.includes('sexual content toward anyone'), 'vague blanket ban is gone');
  const speechSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'commands', 'speechwriter.js'), 'utf8');
  assert.ok(speechSrc.includes('refusalPolicy'), 'speechwriter uses the shared policy');
});
