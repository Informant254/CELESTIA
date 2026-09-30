const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const owner = require('../commands/owner');

test('.owner identifies the owner without exposing a phone contact', async () => {
  const sent = [];
  const sock = {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: 'owner-response' } };
    },
  };
  const msg = { key: { remoteJid: 'chat@s.whatsapp.net', id: 'owner-command' } };

  await owner.execute(sock, msg);

  assert.equal(sent.length, 1, 'owner command sends one fast response');
  assert.match(sent[0].content.text, /Owner.*CELESTIA Owner/);
  assert.match(sent[0].content.text, /Contact.*Private/);
  assert.ok(!sent[0].content.contacts, 'no phone-bearing contact card');
});

test('public command copy does not interpolate the configured owner number', () => {
  for (const file of ['owner.js', 'addsudo.js', 'ison.js', 'void.js', 'celestia.js', 'donate.js']) {
    const source = fs.readFileSync(path.join(ROOT, 'commands', file), 'utf8');
    assert.ok(!source.includes('ownerNumber'), `${file} must not expose the configured owner number`);
  }
});
