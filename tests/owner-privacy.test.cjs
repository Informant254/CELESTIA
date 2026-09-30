const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const owner = require('../commands/owner');
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

const FAKE_OWNER = '254700000099';

function fakeSock(sent) {
  return {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `k${sent.length}` } };
    },
  };
}

test('.owner identifies the owner without exposing a phone contact', async () => {
  const sent = [];
  const msg = { key: { remoteJid: 'chat@s.whatsapp.net', id: 'owner-command' } };

  await owner.execute(fakeSock(sent), msg, []);

  assert.equal(sent.length, 1, 'owner command sends one fast response');
  assert.match(sent[0].content.text, /Owner.*CELESTIA Owner/);
  assert.match(sent[0].content.text, /Contact.*Private/);
  assert.ok(!sent[0].content.contacts, 'no phone-bearing contact card');
});

test('.owner relay reaches the owner without ever showing their number', async () => {
  const prevNumber = config.ownerNumber;
  const prevThreads = settingsStore.get('ghost_threads', undefined);
  config.ownerNumber = FAKE_OWNER;
  try {
    const sent = [];
    const msg = { key: { remoteJid: '222222@s.whatsapp.net', id: 'relay-1', fromMe: false } };

    await owner.execute(fakeSock(sent), msg, ['hello', 'there']);

    assert.equal(sent.length, 2, 'one forward to owner plus one confirmation');
    assert.equal(sent[0].jid, `${FAKE_OWNER}@s.whatsapp.net`, 'forward is routed to the owner inbox');
    assert.match(sent[0].content.text, /hello there/, 'owner sees the message');
    assert.match(sent[0].content.text, /222222/, 'owner sees who to answer');
    assert.match(sent[1].content.text, /Delivered privately/, 'sender gets confirmation');
    for (const entry of sent) {
      assert.ok(!entry.content.text.includes(FAKE_OWNER), 'owner number never appears in user-visible text');
      assert.ok(!entry.content.contacts, 'no contact card anywhere');
    }
    const threads = settingsStore.get('ghost_threads', {});
    assert.ok(Array.isArray(threads['222222']) && threads['222222'].some((t) => t.dir === 'in'), 'inbound thread kept for .ghost inbox');
  } finally {
    config.ownerNumber = prevNumber;
    if (prevThreads === undefined) settingsStore.set('ghost_threads', {});
    else settingsStore.set('ghost_threads', prevThreads);
  }
});

test('.owner relay is rate-limited per sender', async () => {
  const prevNumber = config.ownerNumber;
  const prevThreads = settingsStore.get('ghost_threads', undefined);
  config.ownerNumber = FAKE_OWNER;
  try {
    const first = [];
    const msg = { key: { remoteJid: '333333@s.whatsapp.net', id: 'relay-2', fromMe: false } };
    await owner.execute(fakeSock(first), msg, ['first']);
    assert.equal(first.length, 2);

    const second = [];
    await owner.execute(fakeSock(second), { key: { remoteJid: '333333@s.whatsapp.net', id: 'relay-3', fromMe: false } }, ['second']);
    assert.equal(second.length, 1, 'cooldown sends only the notice');
    assert.match(second[0].content.text, /give them a minute/);
    assert.ok(!second[0].content.text.includes(FAKE_OWNER));
  } finally {
    config.ownerNumber = prevNumber;
    if (prevThreads === undefined) settingsStore.set('ghost_threads', {});
    else settingsStore.set('ghost_threads', prevThreads);
  }
});

test('.owner never forwards the owner to themselves', async () => {
  const prevNumber = config.ownerNumber;
  config.ownerNumber = FAKE_OWNER;
  try {
    const sent = [];
    const msg = { key: { remoteJid: '120363999999999999@g.us', id: 'relay-4', fromMe: false, participant: `${FAKE_OWNER}@s.whatsapp.net` } };
    await owner.execute(fakeSock(sent), msg, ['hello']);
    assert.equal(sent.length, 1, 'owner gets the card, not a relay loop');
    assert.match(sent[0].content.text, /Contact.*Private/);
  } finally {
    config.ownerNumber = prevNumber;
  }
});

test('public command copy does not interpolate the configured owner number', () => {
  for (const file of ['addsudo.js', 'ison.js', 'void.js', 'celestia.js', 'donate.js']) {
    const source = fs.readFileSync(path.join(ROOT, 'commands', file), 'utf8');
    assert.ok(!source.includes('ownerNumber'), `${file} must not expose the configured owner number`);
  }
});
