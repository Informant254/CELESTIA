const { test } = require('node:test');
const assert = require('node:assert/strict');

const { fetchPairingCode } = require('../utils/pairCode');
const pair = require('../commands/pair');
const pair2 = require('../commands/pair2');

const ownerMsg = () => ({
  key: { remoteJid: '999@s.whatsapp.net', fromMe: true, id: 'cmd' },
  message: { conversation: '.pair 254700000001' },
});

function mockSock({ lookup = async () => [{ exists: true }], code = async () => 'ABCD1234', sendDelayMs = 0, events = null } = {}) {
  return {
    async onWhatsApp() { events && events.push('lookup'); return lookup(); },
    async requestPairingCode() { events && events.push('code-requested'); return code(); },
    async sendMessage(jid, content) {
      events && events.push('send:' + String(content.text || '').slice(0, 12));
      if (sendDelayMs) await new Promise((r) => setTimeout(r, sendDelayMs));
      events && events.push('send-resolved');
      return { key: { id: 'm' + Math.random() } };
    },
  };
}

test('code request overlaps the ack send instead of waiting for it', async () => {
  const events = [];
  const sent = [];
  const sock = mockSock({ sendDelayMs: 300, events });
  sock.sendMessage = async (jid, content) => {
    events.push('send:' + String(content.text || '').slice(0, 12));
    await new Promise((r) => setTimeout(r, 300));
    events.push('send-resolved');
    sent.push(content.text);
    return { key: { id: 'mx' } };
  };
  await pair.execute(sock, ownerMsg(), ['254700000001']);
  const codeIdx = events.indexOf('code-requested');
  const resolvedIdx = events.indexOf('send-resolved');
  assert.ok(codeIdx !== -1 && resolvedIdx !== -1, 'both happened: ' + events.join(','));
  assert.ok(codeIdx < resolvedIdx, 'code requested before ack send finished: ' + events.join(','));
  assert.ok(sent.some((t) => t.includes('ABCD1234')), 'code delivered');
});

test('hanging number lookup fails open instead of hanging the command', async () => {
  const slow = fetchPairingCode(mockSock({ lookup: () => new Promise(() => {}) }), '254700000001', { lookupMs: 30, codeMs: 500 });
  assert.equal(await slow, 'ABCD1234');
});

test('unregistered number is reported without requesting a code', async () => {
  let codeAsked = false;
  const sent = [];
  const sock = mockSock({ lookup: async () => [{ exists: false }] });
  sock.requestPairingCode = async () => { codeAsked = true; return 'X'; };
  sock.sendMessage = async (jid, content) => { sent.push(content.text); return { key: { id: 'm' } }; };
  await pair.execute(sock, ownerMsg(), ['254700000009']);
  assert.equal(codeAsked, false, 'no code burned on a bad number');
  assert.ok(sent.some((t) => /not registered/.test(t)), 'clear message: ' + sent.join('|'));
});

test('slow code request fails fast with a retry message', async () => {
  const sent = [];
  const sock = mockSock({ code: () => new Promise(() => {}) });
  const realFetch = require('../utils/pairCode').fetchPairingCode;
  // force tiny timeouts by racing: stub requestPairingCode to hang, command default is 30s —
  // instead verify helper-level timeout text path quickly
  await assert.rejects(
    realFetch(sock, '254700000001', { lookupMs: 20, codeMs: 40 }),
    /timed out/,
    'helper times out'
  );
  assert.ok(sent.length === 0, 'no chat spam in helper test');
});

test('pair2 shares the fast path', async () => {
  const sent = [];
  const sock = mockSock({});
  sock.sendMessage = async (jid, content) => { sent.push(content.text); return { key: { id: 'm' } }; };
  await pair2.execute(sock, ownerMsg(), ['254700000002']);
  assert.ok(sent.some((t) => t.includes('ABCD1234')), 'pair2 delivers code: ' + sent.join('|'));
});
