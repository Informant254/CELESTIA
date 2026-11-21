const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const banList = require('../utils/banList');

const FILE = path.join(__dirname, '..', 'data', 'banned.json');

function withSavedList(fn) {
  return async () => {
    const existed = fs.existsSync(FILE);
    const prev = existed ? fs.readFileSync(FILE, 'utf8') : null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, '[]');
      await fn();
    } finally {
      if (prev === null) {
        try { fs.unlinkSync(FILE); } catch {}
      } else {
        fs.writeFileSync(FILE, prev);
      }
    }
  };
}

test('a LID ban also blocks the same account presenting as PN', withSavedList(async () => {
  banList.banUser('999900001111222233@lid');
  const msg = {
    key: {
      remoteJid: '120363000000000000@g.us',
      participant: '999900001111222233@lid',
      participantPn: '254700000000@s.whatsapp.net',
    },
  };
  assert.equal(banList.isBannedMessage(msg), true);
  assert.equal(banList.isBanned('999900001111222233@s.whatsapp.net:12'), true);
}));

test('a PN ban also blocks the same account presenting as LID', withSavedList(async () => {
  banList.banUser('254700000000@s.whatsapp.net');
  const msg = {
    key: {
      remoteJid: '120363000000000000@g.us',
      participant: '999900001111222233@lid',
      participantPn: '254700000000@s.whatsapp.net',
    },
  };
  assert.equal(banList.isBannedMessage(msg), true);
}));

test('unrelated accounts are not banned and unban clears the match', withSavedList(async () => {
  banList.banUser('254700000000@s.whatsapp.net');
  const other = { key: { remoteJid: '120363000000000000@g.us', participant: '254711111111@s.whatsapp.net' } };
  assert.equal(banList.isBannedMessage(other), false);
  banList.unbanUser('254700000000@s.whatsapp.net');
  const cleared = { key: { remoteJid: '120363000000000000@g.us', participant: '254700000000@s.whatsapp.net' } };
  assert.equal(banList.isBannedMessage(cleared), false);
}));
