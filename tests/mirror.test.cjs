const { test } = require('node:test');
const assert = require('node:assert/strict');

const settingsStore = require('../utils/settingsStore');
const mirror = require('../utils/mirror');
const mirrorCmd = require('../commands/mirror');
const agentCmd = require('../commands/mirroragent');

const KEYS = ['mirror_master', 'mirror_agent_on', 'mirror_bots', 'mirror_ids'];
function snap() {
  const s = {};
  for (const k of KEYS) s[k] = settingsStore.get(k, undefined);
  return s;
}
function restore(s) {
  for (const k of KEYS) {
    if (s[k] === undefined) settingsStore.set(k, k === 'mirror_bots' ? [] : k === 'mirror_ids' ? {} : k === 'mirror_agent_on' ? false : null);
    else settingsStore.set(k, s[k]);
  }
}

const dmFrom = (remoteJid, text, extra = {}) => ({
  key: { remoteJid, fromMe: false, id: 'm1', ...extra },
  message: { conversation: text },
});

test('envelope and invisible result marker round-trip', () => {
  assert.equal(mirror.parseEnvelope('!m .ping'), '.ping');
  assert.equal(mirror.parseEnvelope('.ping'), null);
  const body = mirror.buildResult('pong');
  assert.equal(body.codePointAt(0), 0x200b, 'invisible marker prefix');
  assert.ok(body.includes('MIRROR-RES '), 'marker present');
  assert.equal(mirror.parseResult(body), 'pong');
  assert.equal(mirror.parseResult('hello'), null);
});

test('master gate: PN, LID, and learned mapping all match', () => {
  const s = snap();
  try {
    settingsStore.set('mirror_ids', { 111: '222', 222: '111' });
    const fromPn = dmFrom('254700000001@s.whatsapp.net', '!m .ping');
    const fromLid = dmFrom('222@lid', '!m .ping');
    assert.ok(mirror.isMasterSender(fromPn, '254700000001'), 'PN matches');
    assert.ok(mirror.isMasterSender(fromLid, '111'), 'mapped LID matches');
    assert.ok(!mirror.isMasterSender(fromPn, '999'), 'stranger refused');
    assert.ok(!mirror.isMasterSender(fromPn, null), 'no master refuses');
  } finally {
    restore(s);
  }
});

test('noteContact learns LID/PN pairs; matchesFleet uses them', () => {
  const s = snap();
  try {
    settingsStore.set('mirror_ids', {});
    settingsStore.set('mirror_bots', ['254700000001']);
    mirror.noteContact({ key: { remoteJid: '222@lid', remoteJidAlt: '254700000001@s.whatsapp.net' } });
    assert.equal(mirror.idMap()['222'], '254700000001');
    assert.equal(mirror.matchesFleet(dmFrom('222@lid', 'hi')), '254700000001');
    assert.equal(mirror.matchesFleet(dmFrom('999@s.whatsapp.net', 'hi')), null);
  } finally {
    restore(s);
  }
});

test('agent runs whitelisted commands, refuses the rest', async () => {
  const sent = [];
  const sock = { async sendMessage(j, c) { sent.push(c.text); return { key: { id: 'x' } }; } };
  const ping = { name: 'ping', async execute(sk, m, a, cmds, reply) { await reply('pong!'); } };
  const evil = { name: 'eval', async execute(sk, m, a, cmds, reply) { await reply('owned'); } };
  const commands = new Map([['ping', ping], ['eval', evil]]);
  const msg = dmFrom('254700000001@s.whatsapp.net', '!m .ping');
  assert.equal(await mirror.runAgentCommand(sock, msg, commands), true);
  assert.ok(sent.some((t) => t.includes('pong!') && t.includes('MIRROR-RES')), 'result returned, got: ' + sent.join('|'));
  sent.length = 0;
  await mirror.runAgentCommand(sock, dmFrom('254700000001@s.whatsapp.net', '!m .eval 1+1'), commands);
  assert.ok(sent.some((t) => /Not available remotely/.test(t)), 'evil refused');
  assert.ok(!sent.some((t) => t.includes('owned')), 'evil never ran');
  assert.equal(await mirror.runAgentCommand(sock, dmFrom('254700000001@s.whatsapp.net', 'hello'), commands), false);
});

test('reply correlation resolves and times out', async () => {
  mirror.feedResult('555', 'stale');
  const p = mirror.awaitReply('555', 30);
  setTimeout(() => mirror.feedResult('555', 'alive!'), 5);
  assert.equal(await p, 'alive!');
  assert.equal(await mirror.awaitReply('556', 30), null, 'timeout → null');
});

test('.mirror add/bots/exec end to end', async () => {
  const s = snap();
  try {
    settingsStore.set('mirror_bots', []);
    const sent = [];
    const sock = { async sendMessage(j, c) { sent.push({ j, t: c.text }); return { key: { id: 'x' } }; } };
    const owner = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: true, id: 'c' }, message: { conversation: '.mirror' } };
    await mirrorCmd.execute(sock, owner, ['add', '254700000001']);
    assert.deepEqual(mirror.fleetBots(), ['254700000001']);
    await mirrorCmd.execute(sock, owner, ['bots']);
    assert.ok(sent.some((m) => m.t.includes('254700000001')), 'listed');
    setTimeout(() => mirror.feedResult('254700000001', 'pong!'), 10);
    await mirrorCmd.execute(sock, owner, ['exec', '254700000001', '.ping']);
    const env = sent.find((m) => m.j === '254700000001@s.whatsapp.net');
    assert.ok(env && env.t === '!m .ping', 'envelope sent to agent');
    assert.ok(sent.some((m) => m.t.includes('pong!')), 'result relayed');
    setTimeout(() => {}, 10);
    await mirrorCmd.execute(sock, owner, ['exec', '254700000001', '.ping']);
    assert.ok(sent.some((m) => m.t.includes('no reply')), 'timeout reported');
    await mirrorCmd.execute(sock, owner, ['remove', '254700000001']);
    assert.deepEqual(mirror.fleetBots(), []);
  } finally {
    restore(s);
  }
});

test('.mirroragent link/on/off/status', async () => {
  const s = snap();
  try {
    settingsStore.set('mirror_master', null);
    settingsStore.set('mirror_agent_on', false);
    const sent = [];
    const sock = { async sendMessage(j, c) { sent.push(c.text); return { key: { id: 'x' } }; } };
    const owner = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: true, id: 'c' }, message: { conversation: '.mirroragent' } };
    await agentCmd.execute(sock, owner, ['on']);
    assert.ok(sent.some((t) => /Link a master/.test(t)), 'needs link first');
    await agentCmd.execute(sock, owner, ['link', '254118266549']);
    assert.equal(mirror.getMaster(), '254118266549');
    await agentCmd.execute(sock, owner, ['on']);
    assert.equal(mirror.agentOn(), true);
    await agentCmd.execute(sock, owner, ['status']);
    assert.ok(sent.some((t) => t.includes('254118266549') && t.includes('ping')), 'status shows master + whitelist');
    await agentCmd.execute(sock, owner, ['unlink']);
    assert.equal(mirror.getMaster(), null);
    assert.equal(mirror.agentOn(), false);
    const stranger = { key: { remoteJid: 'd@s.whatsapp.net', fromMe: false, id: 'c', participant: '999@s.whatsapp.net' }, message: { conversation: '.mirroragent' } };
    await agentCmd.execute(sock, stranger, ['status']);
    assert.ok(sent.some((t) => /Only the bot owner/.test(t)), 'stranger refused');
  } finally {
    restore(s);
  }
});
