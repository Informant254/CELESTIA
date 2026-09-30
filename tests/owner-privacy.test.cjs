const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const owner = require('../commands/owner');
const config = require('../config/config');

const FAKE_OWNER = '254700000099';

function fakeSock(sent) {
  return {
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      return { key: { id: `k${sent.length}` } };
    },
  };
}

test('.owner shows the owner contact info with number and vCard', async () => {
  const prevNumber = config.ownerNumber;
  config.ownerNumber = FAKE_OWNER;
  try {
    const sent = [];
    const msg = { key: { remoteJid: 'chat@s.whatsapp.net', id: 'owner-command' } };

    await owner.execute(fakeSock(sent), msg, []);

    assert.equal(sent.length, 2, 'owner command sends info text plus contact card');
    assert.match(sent[0].content.text, /Owner.*CELESTIA Owner/);
    assert.ok(sent[0].content.text.includes(`+${FAKE_OWNER}`), 'info text shows the contact number');
    const vcard = sent[1].content.contacts?.contacts?.[0]?.vcard || '';
    assert.ok(vcard.includes(`waid=${FAKE_OWNER}`), 'vCard carries the owner number');
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
