const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(relative, mocks = {}) {
  const filename = path.resolve(__dirname, relative);
  const native = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, require: id => Object.hasOwn(mocks, id) ? mocks[id] : native(id),
    process: { env: {} }, Buffer, URL, URLSearchParams, encodeURIComponent, AbortSignal, AbortController,
  }, { filename });
  return module.exports;
}

function sockMock(sent) {
  const sock = { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: 'k' }; } };
  sock.user = { id: '254888888888@s.whatsapp.net' };
  return sock;
}

test('displayPhone resolves phone jids, roster LIDs, and rejects unresolvable LIDs', () => {
  const resolver = load('../utils/jidResolver.js');
  const roster = [
    { id: '267791999443191@lid', phoneNumber: '254700000000@s.whatsapp.net', pn: '254700000000@s.whatsapp.net' },
    { id: '254711111111@s.whatsapp.net' },
  ];
  assert.equal(resolver.displayPhone('254700000000@s.whatsapp.net', roster), '254700000000');
  assert.equal(resolver.displayPhone('254711111111@s.whatsapp.net:13', roster), '254711111111');
  assert.equal(resolver.displayPhone('267791999443191@lid', roster), '254700000000');
  assert.equal(resolver.displayPhone('267791999443191@lid', []), null, 'an unresolvable LID must never be shown as digits');
  assert.equal(resolver.displayPhone('', roster), null);
});

test('block resolves LID targets to real numbers before blocking and shows them', async () => {
  const sent = [];
  let blockedWith = null;
  const block = load('../commands/block.js', {
    '@whiskeysockets/baileys': { jidNormalizedUser: jid => jid },
    '../utils/isOwner': { isOwner: () => true },
    '../utils/jidResolver': {
      resolvePhoneJid: async (sock, msg, raw) => raw.endsWith('@lid')
        ? { jid: '254700000000@s.whatsapp.net', resolved: true }
        : { jid: raw, resolved: true },
    },
    '../config/config': { ownerNumber: '254999999999' },
  });
  const sock = sockMock(sent);
  sock.updateBlockStatus = async (jid, action) => { blockedWith = [jid, action]; };
  await block.execute(sock, { key: { remoteJid: 'chat' }, message: { extendedTextMessage: { contextInfo: { mentionedJid: ['267791999443191@lid'] } } } }, []);
  assert.deepEqual(blockedWith, ['254700000000@s.whatsapp.net', 'block'], 'the LID is resolved before WhatsApp acts on it');
  assert.match(sent.at(-1).content.text, /\+254700000000/);
  assert.doesNotMatch(sent.at(-1).content.text, /267791999443191/);
});

test('block keeps the neutral label when a LID cannot be resolved', async () => {
  const sent = [];
  const block = load('../commands/block.js', {
    '@whiskeysockets/baileys': { jidNormalizedUser: jid => jid },
    '../utils/isOwner': { isOwner: () => true },
    '../utils/jidResolver': { resolvePhoneJid: async () => ({ jid: '267791999443191@lid', resolved: false }) },
    '../config/config': { ownerNumber: '254999999999' },
  });
  const sock = sockMock(sent);
  sock.updateBlockStatus = async () => {};
  await block.execute(sock, { key: { remoteJid: 'chat' }, message: { extendedTextMessage: { contextInfo: { mentionedJid: ['267791999443191@lid'] } } } }, []);
  assert.match(sent.at(-1).content.text, /the selected user.*has been blocked/);
  assert.doesNotMatch(sent.at(-1).content.text, /267791999443191/);
});

test('unblock resolves LID targets and never displays raw lid digits', async () => {
  const sent = [];
  const unblock = load('../commands/unblock.js', {
    '../utils/isOwner': { isOwner: () => true },
    '../utils/jidResolver': {
      resolvePhoneJid: async () => ({ jid: '254700000000@s.whatsapp.net', resolved: true }),
    },
  });
  const sock = sockMock(sent);
  sock.updateBlockStatus = async (jid, action) => { sent.push({ jid, action }); };
  await unblock.execute(sock, { key: { remoteJid: 'chat' }, message: { extendedTextMessage: { contextInfo: { mentionedJid: ['267791999443191@lid'] } } } }, []);
  assert.deepEqual(sent.find(m => m.action)?.action, 'unblock');
  assert.match(sent.at(-1).content.text, /\+254700000000/);
});

test('user shows the real number when the LID resolves, privacy note otherwise', async () => {
  const user = load('../commands/user.js', {
    '../utils/jidResolver': { resolvePhoneJid: async () => ({ jid: '254700000000@s.whatsapp.net', resolved: true }) },
  });
  const sent = [];
  const sock = sockMock(sent);
  sock.profilePictureUrl = async () => { throw new Error('no picture'); };
  await user.execute(sock, { key: { remoteJid: 'chat', participant: '267791999443191@lid' } }, []);
  assert.match(sent.at(-1).content.text, /Number: 254700000000/);
  assert.doesNotMatch(sent.at(-1).content.text, /privacy settings/);

  const user2 = load('../commands/user.js', {
    '../utils/jidResolver': { resolvePhoneJid: async () => ({ jid: '267791999443191@lid', resolved: false }) },
  });
  const sent2 = [];
  const sock2 = sockMock(sent2);
  sock2.profilePictureUrl = async () => { throw new Error('no picture'); };
  await user2.execute(sock2, { key: { remoteJid: 'chat', participant: '267791999443191@lid' } }, []);
  assert.match(sent2.at(-1).content.text, /hidden by WhatsApp's privacy settings/);
});
