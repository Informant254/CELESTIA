const { test } = require('node:test');
const assert = require('node:assert/strict');
const { postStatus } = require('../utils/mediaStudio');
const setStatus = require('../commands/whatsapp').find((c) => c.name === 'setstatus');

test('personal broadcasts reject overlap and release the lock after success or failure', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let sends = 0;
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    groupFetchAllParticipating: async () => ({}),
    sendMessage: async () => { sends++; await pending; },
  };
  const first = postStatus(sock, { text: 'one' });
  await assert.rejects(postStatus(sock, { text: 'two' }), /still publishing/);
  release();
  await first;
  assert.equal(sends, 1);
  sock.sendMessage = async () => { throw new Error('send failed'); };
  await assert.rejects(postStatus(sock, { text: 'three' }), /send failed/);
  sock.sendMessage = async () => { sends++; };
  await postStatus(sock, { text: 'four' });
  assert.equal(sends, 2);
});

test('setstatus acknowledges progress and refuses a second command while the first is pending', async () => {
  const sent = [];
  let release;
  let signal;
  const ready = new Promise((resolve) => { signal = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    groupFetchAllParticipating: async () => ({}),
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      if (jid === 'status@broadcast') { signal(); await pending; }
    },
  };
  const msg = { key: { remoteJid: '254700000099@s.whatsapp.net', fromMe: true }, message: { conversation: '.setstatus Hello' } };
  const first = setStatus.execute(sock, msg, ['Hello']);
  await ready;
  await setStatus.execute(sock, msg, ['Again']);
  assert.match(sent[0].content.text, /preparing your Status/);
  assert.match(sent.at(-1).content.text, /previous Status/);
  assert.equal(sent.filter((e) => e.jid === 'status@broadcast').length, 1);
  release();
  await first;
  assert.match(sent.at(-1).content.text, /posted that/);
});
