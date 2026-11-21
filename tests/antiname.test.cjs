const test = require('node:test');
const assert = require('node:assert/strict');

const antiname = require('../utils/antiname');

test('matchesTarget catches the default Queen Sofia name in any dressing', () => {
  assert.equal(antiname.matchesTarget('Queen Sofia', antiname.DEFAULT_TARGETS), true);
  assert.equal(antiname.matchesTarget('👑 QUEEN SOFIA 🌹', antiname.DEFAULT_TARGETS), true);
  assert.equal(antiname.matchesTarget('Queen Sofia Official', antiname.DEFAULT_TARGETS), true);
  assert.equal(antiname.matchesTarget('Queen   Sofia', antiname.DEFAULT_TARGETS), true);
  assert.equal(antiname.matchesTarget('Queen-Sofia', antiname.DEFAULT_TARGETS), true);
  assert.equal(antiname.matchesTarget('Quèen Sofía', antiname.DEFAULT_TARGETS), true);
});

test('matchesTarget ignores unrelated or partial names', () => {
  assert.equal(antiname.matchesTarget('Sofia', antiname.DEFAULT_TARGETS), false);
  assert.equal(antiname.matchesTarget('Queen', antiname.DEFAULT_TARGETS), false);
  assert.equal(antiname.matchesTarget('Sofia Queen', antiname.DEFAULT_TARGETS), false);
  assert.equal(antiname.matchesTarget('Queensley Sofia', antiname.DEFAULT_TARGETS), false);
  assert.equal(antiname.matchesTarget('', antiname.DEFAULT_TARGETS), false);
  assert.equal(antiname.matchesTarget('John Doe', antiname.DEFAULT_TARGETS), false);
});

test('matchesTarget honours custom target lists', () => {
  const custom = ['Queen Sofia', 'Fake Admin'];
  assert.equal(antiname.matchesTarget('The Fake Admin', custom), true);
  assert.equal(antiname.matchesTarget('Queen Sofia', custom), true);
  assert.equal(antiname.matchesTarget('Someone Else', custom), false);
});

test('targetsFor defaults to Queen Sofia for unknown groups', () => {
  assert.deepEqual(antiname.targetsFor('120363000000000000@g.us'), antiname.DEFAULT_TARGETS);
});

test('checkMessage is inert while the feature is off', async () => {
  let touched = false;
  const sock = {
    groupMetadata: async () => { touched = true; return { participants: [] }; },
    groupParticipantsUpdate: async () => { touched = true; },
  };
  const msg = {
    key: { remoteJid: '120363111111111111@g.us', participant: '998877@lid', fromMe: false },
    pushName: 'Queen Sofia',
    message: { extendedTextMessage: { text: 'hi' } },
  };
  assert.equal(await antiname.checkMessage(sock, msg), false);
  assert.equal(touched, false, 'no group metadata call when disabled');
});

test('handleEvent is inert for disabled groups and non-add actions', async () => {
  let touched = false;
  const sock = {
    groupMetadata: async () => { touched = true; return { participants: [] }; },
    groupParticipantsUpdate: async () => { touched = true; },
  };
  await antiname.handleEvent(sock, { id: '120363222222222222@g.us', action: 'add', participants: ['123@lid'] });
  await antiname.handleEvent(sock, { id: '120363222222222222@g.us', action: 'remove', participants: ['123@lid'] });
  await antiname.handleEvent(sock, { id: 'status@broadcast', action: 'add', participants: ['123@lid'] });
  assert.equal(touched, false);
});
