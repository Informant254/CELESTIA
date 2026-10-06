const { test } = require('node:test');
const assert = require('node:assert/strict');
const { postStatus } = require('../utils/mediaStudio');
const setStatus = require('../commands/whatsapp').find((c) => c.name === 'setstatus');
const personalStatus = require('../commands/status');

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
  const group = '120363000000000000@g.us';
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    groupMetadata: async () => ({ id: group, subject: 'Status Group', participants: [{ id: '254700000001@s.whatsapp.net' }] }),
    sendMessage: async (jid, content) => {
      sent.push({ jid, content });
      if (jid === 'status@broadcast') { signal(); await pending; }
    },
  };
  const msg = { key: { remoteJid: '254700000099@s.whatsapp.net', fromMe: true }, message: { conversation: '.setstatus Hello' } };
  const first = setStatus.execute(sock, msg, [group, 'Hello']);
  await ready;
  await setStatus.execute(sock, msg, [group, 'Again']);
  assert.match(sent[0].content.text, /preparing your Status/);
  assert.match(sent.at(-1).content.text, /previous Status/);
  assert.equal(sent.filter((e) => e.jid === 'status@broadcast').length, 1);
  release();
  await first;
  assert.match(sent.at(-1).content.text, /posted that/);
});

test('pstatus acknowledges progress and rejects an overlapping personal broadcast', async () => {
  const sent = [];
  let release;
  let signal;
  const ready = new Promise((resolve) => { signal = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const dm = '254700000099@s.whatsapp.net';
  const sock = {
    user: { id: '254700000099:4@s.whatsapp.net' },
    store: {
      contacts: {
        '254700000001@s.whatsapp.net': {},
        '254700000002@s.whatsapp.net': {},
      },
    },
    sendMessage: async (jid, content, options) => {
      sent.push({ jid, content, options });
      if (jid === 'status@broadcast') {
        signal();
        await pending;
      }
      return { key: { id: `m${sent.length}` } };
    },
  };
  const msg = {
    key: { remoteJid: dm, fromMe: true },
    message: { conversation: '.pstatus Hello' },
  };

  const first = personalStatus.execute(sock, msg, ['Hello']);
  await ready;
  await personalStatus.execute(sock, msg, ['Again']);

  assert.match(sent[0].content.text, /Preparing your personal Status/);
  assert.match(sent.at(-1).content.text, /previous personal Status/);
  assert.equal(sent.filter((entry) => entry.jid === 'status@broadcast').length, 1);

  release();
  await first;
  assert.match(sent.at(-1).content.text, /Personal Status published/);
});
