const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const chreact = require('../utils/chreact');
const chreactCmd = require('../commands/chreact');

const CH = '120363000000000000@newsletter';

const _prevOwnerEnv = process.env.OWNER_NUMBER;
process.env.OWNER_NUMBER = '254118266549'; // test as the operator bot
const config = require('../config/config');
config.ownerNumber = '254118266549';
const nlMsg = (over = {}) => ({
  key: { remoteJid: CH, id: 'srv1', fromMe: false, ...(over.key || {}) },
  message: { conversation: 'big announcement', ...(over.message || {}) },
  ...(over.rest || {}),
});

function withState(fn) {
  const prev = {
    on: settingsStore.get(chreact.ON_KEY, undefined),
    ch: settingsStore.get(chreact.CHANNELS_KEY, undefined),
    em: settingsStore.get(chreact.EMOJIS_KEY, undefined),
  };
  try {
    return fn();
  } finally {
    for (const [k, v] of [['chreact_on', prev.on], ['chreact_channels', prev.ch], ['chreact_emojis', prev.em]]) {
      if (v === undefined) settingsStore.set(k, k === 'chreact_on' ? false : k === 'chreact_channels' ? [] : undefined);
      else settingsStore.set(k, v);
    }
  }
}

test('exclusive to the operator bot', () => {
  assert.equal(chreact.OPERATOR_PN, '254118266549');
  assert.equal(chreact.isOperatorBot(), true, 'this repo is the operator bot');
});

test('maybeReact ignores non-newsletters, reactions, and protocol', async () => {
  await withState(async () => {
    settingsStore.set(chreact.ON_KEY, true);
    settingsStore.set(chreact.CHANNELS_KEY, [CH]);
    let calls = 0;
    const sock = { newsletterReactMessage: async () => { calls++; } };
    assert.equal(chreact.maybeReact(sock, { key: { remoteJid: 'x@g.us', id: 'a' }, message: { conversation: 'hi' } }), false);
    assert.equal(chreact.maybeReact(sock, nlMsg({ message: { reactionMessage: {} } })), false);
    assert.equal(chreact.maybeReact(sock, nlMsg({ message: { protocolMessage: {} } })), false);
    assert.equal(calls, 0);
  });
});

test('maybeReact fires once per post then dedups', async () => {
  await withState(async () => {
    settingsStore.set(chreact.ON_KEY, true);
    settingsStore.set(chreact.CHANNELS_KEY, [CH]);
    const calls = [];
    const sock = { newsletterReactMessage: async (jid, sid, emoji) => { calls.push({ jid, sid, emoji }); } };
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => { fn(); return 0; };
    try {
      assert.equal(chreact.maybeReact(sock, nlMsg()), true);
      assert.equal(chreact.maybeReact(sock, nlMsg()), false, 'redelivery deduped');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].jid, CH);
      assert.equal(calls[0].sid, 'srv1');
      assert.ok(chreact.emojis().includes(calls[0].emoji));
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});

test('maybeReact stays silent when off or channel not opted in', async () => {
  await withState(async () => {
    settingsStore.set(chreact.ON_KEY, false);
    settingsStore.set(chreact.CHANNELS_KEY, [CH]);
    let calls = 0;
    const sock = { newsletterReactMessage: async () => { calls++; } };
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn) => { fn(); return 0; };
    try {
      assert.equal(chreact.maybeReact(sock, nlMsg()), false);
      settingsStore.set(chreact.ON_KEY, true);
      settingsStore.set(chreact.CHANNELS_KEY, []);
      assert.equal(chreact.maybeReact(sock, nlMsg()), false);
      assert.equal(calls, 0);
    } finally {
      global.setTimeout = origSetTimeout;
    }
  });
});

test('.chreact command: on/off/emojis/list/follow/unfollow', async () => {
  await withState(async () => {
    const sent = [];
    const sock = {
      async sendMessage(jid, content) { sent.push(content.text); return { key: { id: 'm' } }; },
      async newsletterFollow(j) { this.followed = j; },
      async newsletterUnfollow(j) { this.unfollowed = j; },
      async newsletterMetadata() { return { id: '999@newsletter' }; },
    };
    const owner = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: true, id: 'c' }, message: { conversation: '.chreact' } };
    await chreactCmd.execute(sock, owner, ['on']);
    assert.equal(settingsStore.get(chreact.ON_KEY), true);
    await chreactCmd.execute(sock, owner, ['emojis', '🔥❤️']);
    assert.deepEqual(settingsStore.get(chreact.EMOJIS_KEY), ['🔥', '❤️']);
    await chreactCmd.execute(sock, owner, ['follow', '12345@newsletter']);
    assert.ok(settingsStore.get(chreact.CHANNELS_KEY).includes('12345@newsletter'));
    assert.equal(sock.followed, '12345@newsletter');
    await chreactCmd.execute(sock, owner, ['follow', 'https://whatsapp.com/channel/AbCdEf']);
    assert.ok(settingsStore.get(chreact.CHANNELS_KEY).includes('999@newsletter'), 'invite resolved + followed');
    await chreactCmd.execute(sock, owner, ['list']);
    assert.ok(sent.some((t) => t.includes('12345@newsletter')), 'list shows channels');
    await chreactCmd.execute(sock, owner, ['unfollow', '12345@newsletter']);
    assert.ok(!settingsStore.get(chreact.CHANNELS_KEY).includes('12345@newsletter'));
    await chreactCmd.execute(sock, owner, ['off']);
    assert.equal(settingsStore.get(chreact.ON_KEY), false);
  });
});

test('cycle rotates emojis then stops', async () => {
  settingsStore.set(chreact.CYCLE_KEY, null);
  const calls = [];
  const sock = { newsletterReactMessage: async (jid, sid, emoji) => { calls.push(emoji); } };
  const st = chreact.startCycle({ jid: CH, serverId: 'srv9', emojis: ['🔥', '❤️'], everyMin: 2, maxCycles: 3 });
  assert.ok(st, 'cycle started');
  assert.equal(st.everyMin, 2);
  // force due
  const due = () => {
    const s = chreact.cycleState();
    s.nextAt = Date.now() - 1;
    settingsStore.set(chreact.CYCLE_KEY, s);
  };
  due(); assert.equal(await chreact.tickCycle(sock), true);
  due(); assert.equal(await chreact.tickCycle(sock), true);
  due(); assert.equal(await chreact.tickCycle(sock), true);
  assert.deepEqual(calls, ['🔥', '❤️', '🔥'], 'rotates in order');
  assert.equal(chreact.cycleState(), null, 'stops after max cycles');
  assert.equal(await chreact.tickCycle(sock), false, 'quiet without state');
  chreact.stopCycle();
});

test('.chreact cycle command wires the newest post', async () => {
  const sent = [];
  const sock = {
    async sendMessage(jid, content) { sent.push(content.text); return { key: { id: 'm' } }; },
  };
  const owner = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: true, id: 'c' }, message: { conversation: '.chreact' } };
  settingsStore.set(chreact.CYCLE_KEY, null);
  settingsStore.set(chreact.LAST_POST_KEY, null);
  await chreactCmd.execute(sock, owner, ['cycle', '10', '🔥❤️']);
  assert.ok(sent.some((t) => /No channel post seen/.test(t)), 'needs a post first');
  settingsStore.set(chreact.LAST_POST_KEY, { jid: CH, serverId: 'srv7' });
  await chreactCmd.execute(sock, owner, ['cycle', '10', '🔥❤️']);
  const st = chreact.cycleState();
  assert.ok(st && st.serverId === 'srv7' && st.everyMin === 10, 'cycle armed on newest post');
  await chreactCmd.execute(sock, owner, ['stopcycle']);
  assert.equal(chreact.cycleState(), null, 'stopped');
  settingsStore.set(chreact.LAST_POST_KEY, null);
});

test('.chreact refuses non-owners', async () => {  const sent = [];
  const sock = { async sendMessage(jid, content) { sent.push(content.text); } };
  const stranger = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: false, id: 'c', participant: '999@s.whatsapp.net' }, message: { conversation: '.chreact on' } };
  await chreactCmd.execute(sock, stranger, ['on']);
  assert.ok(sent.some((t) => /Only the bot owner/.test(t)));
});
