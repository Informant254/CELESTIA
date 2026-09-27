const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const tone = require('../autochat/tone');
const toneCmd = require('../commands/tone');

const KEY = 'autochat_tone';

function withClean(fn) {
  const prev = settingsStore.get(KEY, undefined);
  settingsStore.set(KEY, {});
  return Promise.resolve().then(fn).finally(() => settingsStore.set(KEY, prev === undefined ? {} : prev));
}

const ownerMsg = (remoteJid, text, ctx = {}) => ({
  key: { remoteJid, fromMe: true, id: 'c' },
  message: { extendedTextMessage: { text, contextInfo: ctx } },
});
const sock = (sent) => ({ async sendMessage(jid, content) { sent.push(content.text); return { key: { id: 'm' } }; } });

test('tone tags resolve in DMs, groups, and tags', async () => {
  await withClean(async () => {
    let sent = [];
    // inside her DM, no target needed
    await toneCmd.execute(sock(sent), ownerMsg('254711111111@s.whatsapp.net', '.tone girl'), ['girl']);
    assert.equal(tone.get('254711111111'), 'girl');
    // tag from anywhere
    sent = [];
    await toneCmd.execute(sock(sent), ownerMsg('999@s.whatsapp.net', '.tone boy'), ['boy', '@254722222222']);
    assert.equal(tone.get('254722222222'), 'boy');
    // reply in a group
    sent = [];
    await toneCmd.execute(sock(sent), ownerMsg('120363999@g.us', '.tone girl', { participant: '100000000000007@lid' }), ['girl']);
    assert.equal(tone.get('100000000000007'), 'girl');
    // off clears
    await toneCmd.execute(sock(sent), ownerMsg('254711111111@s.whatsapp.net', '.tone off'), ['off']);
    assert.equal(tone.get('254711111111'), null);
  });
});

test('resolve picks the right person per group thread', async () => {
  await withClean(async () => {
    tone.set('100000000000001', 'girl');
    tone.set('100000000000002', 'boy');
    const g = '120363999@g.us';
    const msgA = { key: { remoteJid: g, participant: '100000000000001@lid' } };
    const msgB = { key: { remoteJid: g, participant: '100000000000002@lid' } };
    assert.equal(tone.resolve(msgA, `${g}::100000000000001`, g), 'girl');
    assert.equal(tone.resolve(msgB, `${g}::100000000000002`, g), 'boy');
    assert.equal(tone.resolve({ key: { remoteJid: g, participant: '100000000000009@lid' } }, `${g}::100000000000009`, g), null);
    assert.equal(tone.resolve({ key: { remoteJid: '254733333333@s.whatsapp.net' } }, '254733333333@s.whatsapp.net', '254733333333@s.whatsapp.net'), null);
  });
});

test('persona carries the right energy block per tone', () => {
  const persona = require('../autochat/persona');
  const g = persona.build({ chatId: 'd@s.whatsapp.net', incoming: 'hey', tone: 'girl' });
  const b = persona.build({ chatId: 'd@s.whatsapp.net', incoming: 'hey', tone: 'boy' });
  const n = persona.build({ chatId: 'd@s.whatsapp.net', incoming: 'hey' });
  assert.match(g.system, /HER ENERGY/);
  assert.match(b.system, /HIS ENERGY/);
  assert.match(n.system, /TONE: neutral/);
  assert.ok(!/HIS ENERGY/.test(g.system) && !/HER ENERGY/.test(b.system), 'energies never cross');
});
