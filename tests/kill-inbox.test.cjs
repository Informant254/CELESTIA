const { test } = require('node:test');
const assert = require('node:assert/strict');

const kill = require('../commands/kill');

const GROUP = '120363999999999999@g.us';
const BOT = '254700000001@s.whatsapp.net';

function mockSock(groupId = GROUP) {
  const sent = [];
  const removed = [];
  return {
    sent, removed,
    user: { id: BOT },
    async sendMessage(jid, content) { sent.push({ jid, text: content.text }); return { key: { id: 'm' } }; },
    async groupMetadata(j) {
      assert.equal(j, groupId);
      return { id: groupId, subject: 'Test Group', participants: [{ id: BOT, admin: 'admin' }, { id: '111@s.whatsapp.net' }, { id: '222@s.whatsapp.net' }] };
    },
    async groupGetInviteInfo(code) {
      assert.equal(code, 'InviteCode1234567890');
      return { id: groupId, subject: 'Test Group' };
    },
    async groupParticipantsUpdate(j, users, action) {
      assert.equal(j, groupId);
      assert.equal(action, 'remove');
      removed.push(...users);
      return {};
    },
  };
}

const dmOwner = (text) => ({
  key: { remoteJid: '999@s.whatsapp.net', fromMe: true, id: 'c' },
  message: { conversation: text },
});
const groupOwner = (text) => ({
  key: { remoteJid: GROUP, fromMe: true, id: 'c' },
  message: { conversation: text },
});

test('inbox without a target explains inbox usage', async () => {
  const sock = mockSock();
  await kill.execute(sock, dmOwner('.kill'), []);
  assert.ok(sock.sent.some((m) => /Inbox usage/.test(m.text)), 'usage, got: ' + sock.sent.map((m) => m.text).join('|'));
  assert.equal(sock.removed.length, 0, 'nothing removed');
});

test('inbox with JID previews then kills the remote group', async () => {
  const G = '120363888888888888@g.us';
  const sock = mockSock(G);
  await kill.execute(sock, dmOwner('.kill'), [G]);
  assert.ok(sock.sent.some((m) => m.text.includes(`${G} ok`)), 'preview names the confirm, got: ' + sock.sent.map((m) => m.text).join('|'));
  await kill.execute(sock, dmOwner('.kill'), [G, 'ok']);
  assert.deepEqual([...sock.removed].sort(), ['111@s.whatsapp.net', '222@s.whatsapp.net'], 'members removed, bot spared');
  assert.ok(sock.sent.every((m) => m.jid === '999@s.whatsapp.net'), 'all replies in the inbox');
  assert.ok(sock.sent.some((m) => /Removed: 2/.test(m.text)), 'result reported');
});

test('inbox with invite link resolves then kills', async () => {
  const G = '120363777777777777@g.us';
  const sock = mockSock(G);
  const link = 'https://chat.whatsapp.com/InviteCode1234567890';
  await kill.execute(sock, dmOwner('.kill'), [link]);
  assert.ok(sock.sent.some((m) => m.text.includes('DANGER')), 'preview shown');
  await kill.execute(sock, dmOwner('.kill'), [link, 'ok']);
  assert.equal(sock.removed.length, 2, 'resolved group killed');
});

test('group usage unchanged (preview says .kill ok)', async () => {
  const sock = mockSock();
  await kill.execute(sock, groupOwner('.kill'), []);
  assert.ok(sock.sent.some((m) => m.text.includes('*.kill ok*')), 'classic confirm, got: ' + sock.sent.map((m) => m.text).join('|'));
});
