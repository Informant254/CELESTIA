const { test } = require('node:test');
const assert = require('node:assert/strict');

const groupSettingsStore = require('../utils/groupSettingsStore');
const antikill = require('../utils/antikill');
const antikillCmd = require('../commands/antikill');

const GROUP = '120363999999999999@g.us';
const BOT = '254700000001@s.whatsapp.net';
const OWNER = '254700000099@s.whatsapp.net';
const ATTACKER = '100000000000002@lid';
const VICTIM1 = '100000000000003@lid';
const VICTIM2 = '100000000000004@lid';

function mockSock() {
  const calls = [];
  const sent = [];
  return {
    calls, sent,
    user: { id: BOT },
    async groupMetadata() {
      return { id: GROUP, subject: 'Fort', participants: [{ id: BOT, admin: 'admin' }, { id: ATTACKER }, { id: VICTIM1 }, { id: VICTIM2 }] };
    },
    async groupParticipantsUpdate(jid, users, action) { calls.push({ jid, users, action }); return {}; },
    async sendMessage(jid, content) { sent.push({ jid, text: content.text }); return { key: { id: 'm' } }; },
  };
}

function withFlag(on, fn) {
  const prev = groupSettingsStore.get(GROUP, 'antikill', undefined);
  groupSettingsStore.set(GROUP, 'antikill', on);
  return Promise.resolve().then(fn).finally(() => groupSettingsStore.set(GROUP, 'antikill', prev));
}

test('hostile kick is re-added instantly', async () => {
  await withFlag(true, async () => {
    const sock = mockSock();
    const handled = await antikill.handleEvent(sock, { id: GROUP, participants: [VICTIM1], action: 'remove', author: ATTACKER });
    assert.equal(handled, true);
    assert.ok(sock.calls.some((c) => c.action === 'add' && c.users.includes(VICTIM1)), 'victim re-added: ' + JSON.stringify(sock.calls));
  });
});

test('voluntary leave is respected, owner kicks ignored', async () => {
  await withFlag(true, async () => {
    const sock = mockSock();
    await antikill.handleEvent(sock, { id: GROUP, participants: [VICTIM1], action: 'remove', author: VICTIM1 });
    assert.ok(!sock.calls.some((c) => c.action === 'add'), 'leaver not dragged back');
    await antikill.handleEvent(sock, { id: GROUP, participants: [VICTIM1], action: 'remove', author: OWNER });
    assert.ok(!sock.calls.some((c) => c.action === 'demote'), 'owner never punished');
  });
});

test('repeat attacker is demoted and removed at 3 strikes', async () => {
  await withFlag(true, async () => {
    const sock = mockSock();
    for (let i = 0; i < 3; i++) {
      await antikill.handleEvent(sock, { id: GROUP, participants: [VICTIM1], action: 'remove', author: ATTACKER });
    }
    assert.ok(sock.calls.some((c) => c.action === 'demote' && c.users.includes(ATTACKER)), 'demoted');
    assert.ok(sock.calls.some((c) => c.action === 'remove' && c.users.includes(ATTACKER)), 'attacker removed');
  });
});

test('silent when flag off', async () => {
  await withFlag(false, async () => {
    const sock = mockSock();
    assert.equal(await antikill.handleEvent(sock, { id: GROUP, participants: [VICTIM1], action: 'remove', author: ATTACKER }), false);
    assert.equal(sock.calls.length, 0, 'no counter-action');
  });
});

test('.antikill command toggles (admin gate)', async () => {
  const prev = groupSettingsStore.get(GROUP, 'antikill', undefined);
  const sent = [];
  const sock = {
    user: { id: BOT },
    async groupMetadata() { return { id: GROUP, participants: [{ id: BOT, admin: 'admin' }, { id: ATTACKER, admin: 'admin' }] }; },
    async sendMessage(jid, content) { sent.push(content.text); return { key: { id: 'm' } }; },
  };
  const adminMsg = { key: { remoteJid: GROUP, participant: ATTACKER, id: 'c' }, message: { conversation: '.antikill on' } };
  try {
    await antikillCmd.execute(sock, adminMsg, ['on']);
    assert.equal(groupSettingsStore.get(GROUP, 'antikill'), true);
    assert.ok(sent.some((t) => /AntiKill ON/.test(t)));
    await antikillCmd.execute(sock, adminMsg, ['off']);
    assert.equal(groupSettingsStore.get(GROUP, 'antikill'), false);
    const stranger = { key: { remoteJid: GROUP, participant: VICTIM1, id: 'c' }, message: { conversation: '.antikill on' } };
    await antikillCmd.execute(sock, stranger, ['on']);
    assert.ok(sent.some((t) => /admins or the bot owner/.test(t)), 'stranger refused');
  } finally {
    groupSettingsStore.set(GROUP, 'antikill', prev);
  }
});
