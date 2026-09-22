const { test } = require('node:test');
const assert = require('node:assert/strict');

function delCommand() {
  delete require.cache[require.resolve('../commands/whatsapp')];
  return require('../commands/whatsapp').find((c) => c.name === 'del');
}

function mockSock(participants) {
  const sent = [];
  return {
    sent,
    user: { id: '254118266549:64@s.whatsapp.net', lid: '184941979672752:64@lid' },
    async groupMetadata() { return { participants }; },
    async sendMessage(jid, content) { sent.push({ jid, content }); return { key: { id: 'm1' } }; },
  };
}

function groupMsg(participant) {
  return {
    key: { remoteJid: '120363430800332461@g.us', fromMe: false, id: 'cmd1' },
    message: {
      extendedTextMessage: {
        text: '.del',
        contextInfo: {
          quotedMessage: { conversation: 'remove this' },
          stanzaId: 'QUOTED1',
          participant,
        },
      },
    },
  };
}

test('del finds bot admin via LID-form participant id', async () => {
  const sock = mockSock([
    { id: '184941979672752@lid', admin: 'admin' },
    { id: '99999@s.whatsapp.net', admin: null },
  ]);
  await delCommand().execute(sock, groupMsg('55555@s.whatsapp.net'));
  const texts = sock.sent.map((m) => m.content.text).filter(Boolean);
  assert.ok(!texts.some((t) => /admin/i.test(t)), 'no admin prompt, got: ' + texts.join('|'));
  const del = sock.sent.find((m) => m.content.delete);
  assert.ok(del, 'delete stanza sent');
  assert.equal(del.content.delete.id, 'QUOTED1');
});

test('del asks for bot admin rights only when the bot truly lacks them', async () => {
  const sock = mockSock([{ id: '184941979672752@lid', admin: null }]);
  await delCommand().execute(sock, groupMsg('55555@s.whatsapp.net'));
  const texts = sock.sent.map((m) => m.content.text).filter(Boolean);
  assert.ok(texts.some((t) => /I need admin rights/.test(t)), 'clear bot-admin message, got: ' + texts.join('|'));
  assert.ok(!sock.sent.some((m) => m.content.delete), 'no delete attempted');
});

test('del skips the admin check for the bot own LID-addressed message', async () => {
  const sock = mockSock([]);
  let metadataCalled = false;
  sock.groupMetadata = async () => { metadataCalled = true; return { participants: [] }; };
  await delCommand().execute(sock, groupMsg('184941979672752@lid'));
  assert.equal(metadataCalled, false, 'no metadata lookup for own message');
  assert.ok(sock.sent.some((m) => m.content.delete), 'delete stanza sent');
});
