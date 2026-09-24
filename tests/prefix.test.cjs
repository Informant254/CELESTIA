const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const prefixCmd = require('../commands/prefix');

const owner = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: true, id: 'c' }, message: { conversation: '.prefix' } };
const sock = (sent) => ({ async sendMessage(jid, content) { sent.push(content.text); return { key: { id: 'm' } }; } });

test('letter/digit prefixes are refused, symbols accepted', async () => {
  const prev = settingsStore.get('prefix', undefined);
  try {
    settingsStore.set('prefix', '.');
    let sent = [];
    await prefixCmd.execute(sock(sent), owner, ['x']);
    assert.ok(sent.some((t) => /Letters and numbers/.test(t)), 'x refused: ' + sent.join('|'));
    assert.equal(settingsStore.get('prefix'), '.', 'unchanged after refusal');
    sent = [];
    await prefixCmd.execute(sock(sent), owner, ['9']);
    assert.ok(sent.some((t) => /Letters and numbers/.test(t)), 'digit refused');
    sent = [];
    await prefixCmd.execute(sock(sent), owner, ['!']);
    assert.equal(settingsStore.get('prefix'), '!', 'symbol accepted');
    assert.ok(sent.some((t) => t.includes('`!`')), 'confirmation shown');
  } finally {
    if (prev === undefined) settingsStore.set('prefix', '.');
    else settingsStore.set('prefix', prev);
  }
});
