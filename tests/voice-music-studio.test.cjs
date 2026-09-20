const { test } = require('node:test');
const assert = require('node:assert/strict');

const speech = require('../utils/speech');
const studio = require('../commands/musicstudio');

test('speech parser combines valid recognition lines and ignores noise', () => {
  const payload = [
    '{}',
    JSON.stringify({ result: [{ alternative: [{ transcript: 'hello Celestia' }] }] }),
    'not-json',
    JSON.stringify({ result: [{ alternative: [{ transcript: 'how are you' }] }] }),
  ].join('\n');
  assert.equal(speech.parseTranscript(payload), 'hello Celestia how are you');
});

test('Music Studio exposes only fixed named filter presets', () => {
  const presets = studio._internals.PRESETS;
  assert.deepEqual(Object.keys(presets).sort(), ['bass', 'clean', 'deep', 'echo', 'fast', 'karaoke', 'nightcore', 'normalize', 'reverb', 'reverse', 'robot', 'slow']);
  assert.equal(presets['bass;rm -rf'], undefined);
  for (const filter of Object.values(presets)) {
    assert.equal(typeof filter, 'string');
    assert.ok(filter.length > 3);
  }
});

test('Music Studio rejects unknown effects before media processing', async () => {
  const sent = [];
  const sock = { sendMessage: async (_jid, content) => { sent.push(content); } };
  const msg = { key: { remoteJid: 'chat@s.whatsapp.net' }, message: {} };
  await studio.execute(sock, msg, ['bass;rm']);
  assert.match(sent[0].text, /MUSIC STUDIO/);
  assert.equal(sent.some((item) => item.audio), false);
});
