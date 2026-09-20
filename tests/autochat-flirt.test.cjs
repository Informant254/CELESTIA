const { test } = require('node:test');
const assert = require('node:assert/strict');
const settingsStore = require('../utils/settingsStore');
const flirt = require('../autochat/flirt');
const persona = require('../autochat/persona');

test('flirt allowlist normalizes numbers and matches PN-addressed inboxes only', () => {
  const previous = settingsStore.get('autochat_flirt_numbers', []);
  try {
    settingsStore.set('autochat_flirt_numbers', []);
    assert.equal(flirt.add('+254 700-123-456'), true);
    assert.deepEqual(flirt.list(), ['254700123456']);
    assert.equal(flirt.isAllowed({ key: { remoteJid: '254700123456@s.whatsapp.net' } }), true);
    assert.equal(flirt.isAllowed({ key: { remoteJid: '120363@g.us', participantPn: '254700123456@s.whatsapp.net' } }), false);
  } finally { settingsStore.set('autochat_flirt_numbers', previous); }
});

test('LID inboxes match their phone-number alternate and removals persist', () => {
  const previous = settingsStore.get('autochat_flirt_numbers', []);
  try {
    settingsStore.set('autochat_flirt_numbers', ['254711222333']);
    assert.equal(flirt.isAllowed({ key: { remoteJid: '999999@lid', remoteJidAlt: '254711222333@s.whatsapp.net' } }), true);
    assert.equal(flirt.remove('254711222333'), true);
    assert.equal(flirt.list().length, 0);
  } finally { settingsStore.set('autochat_flirt_numbers', previous); }
});

test('romantic mode stays subordinate to learned owner voice and consent', () => {
  const built = persona.build({ chatId: 'flirt-test', incoming: 'hey', pushName: 'Owner', contactName: 'Friend', flirt: true });
  assert.match(built.system, /Keep the OWNER VOICE exactly/);
  assert.match(built.system, /immediately become friendly and neutral/);
  assert.match(built.system, /not manipulation or pressure/);
});
