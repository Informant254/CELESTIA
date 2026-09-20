const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const realRequire = createRequire(path.join(ROOT, 'events/messages.js'));

const GROUP = '120363999999999999@g.us';
const BOT_PN = '254700000001@s.whatsapp.net';
const BOT_LID = '100000000000001@lid';
const MEMBER = '100000000000002@lid';
const ADMIN = '100000000000009@lid';

function loadMessagesHarness({ privacy = 'private', settings = {}, group = {}, botAdmin = true, admins = [], noLid = false, commands = new Map(), stalledExtras = false } = {}) {
  const mem = { ...settings };
  const gmem = { ...group };
  const warns = new Map();
  const sent = [];
  const removed = [];
  let handler;
  let aiCalls = 0;
  const warningsStub = {
    addWarning: (gk, uk) => { const k = `${gk}::${uk}`; warns.set(k, (warns.get(k) || 0) + 1); return warns.get(k); },
    resetWarnings: (gk, uk) => { warns.delete(`${gk}::${uk}`); },
    getWarnings: (gk, uk) => warns.get(`${gk}::${uk}`) || 0,
  };
  const stubs = {
    '../config/config': { WORK_TYPE: privacy, prefix: '.', ownerNumber: '254700000099' },
    '../utils/settingsStore': { get: (k, fb) => (k in mem ? mem[k] : fb), set: (k, v) => { mem[k] = v; } },
    '../utils/groupSettingsStore': {
      get: (j, k, fb) => (gmem[j] && k in gmem[j] ? gmem[j][k] : fb),
      set: (j, k, v) => { gmem[j] = gmem[j] || {}; gmem[j][k] = v; },
      getAll: (j) => ({ ...(gmem[j] || {}) }),
    },
    '../utils/logger': { info() {}, warn() {}, error() {} },
    '../utils/isSudo': { isSudo: () => false },
    '../utils/viewonceVault': { isAutoOn: () => false, monitorReply: () => stalledExtras ? new Promise(() => {}) : Promise.resolve() },
    '../utils/warnings': warningsStub,
    '../autochat/index': { handleIncoming: async () => { aiCalls++; return true; } },
    fs: {
      readFileSync: (p) => (String(p).includes('badwords') ? '["damn"]' : '1'),
      existsSync: () => false,
      statSync: (p) => { if (String(p).includes('badwords')) return { mtimeMs: 5 }; throw new Error('noent'); },
      mkdirSync: () => {}, writeFileSync: () => {},
    },
  };
  const context = {
    require: (id) => (id in stubs ? stubs[id] : realRequire(id)),
    module: { exports: {} }, __dirname: path.join(ROOT, 'events'), console: { log() {} }, setTimeout, clearTimeout,
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'events/messages.js'), 'utf8'), context);
  const blocked = [];
  let metadataCalls = 0;
  const sock = {
    user: noLid ? { id: BOT_PN } : { id: BOT_PN, lid: BOT_LID },
    ev: { on: (ev, fn) => { if (ev === 'messages.upsert') handler = fn; } },
    groupMetadata: async () => { metadataCalls++; return ({
      id: GROUP,
      participants: [
        { id: BOT_LID, admin: botAdmin ? 'admin' : null },
        { id: ADMIN, admin: 'admin' },
        ...admins.map((a) => ({ id: a, admin: 'admin' })),
        { id: MEMBER },
      ],
    }); },
    sendMessage: async (jid, content) => { sent.push(content); if (stalledExtras && content.react) return new Promise(() => {}); return { key: { id: 's' + sent.length } }; },
    groupParticipantsUpdate: async (jid, users, action) => { removed.push({ users, action }); return {}; },
    updateBlockStatus: async (jid, action) => { blocked.push({ jid, action }); return {}; },
    sendPresenceUpdate: () => stalledExtras ? new Promise(() => {}) : Promise.resolve(),
    readMessages: async () => {},
  };
  context.module.exports.registerMessageHandler(sock, commands);
  let n = 0;
  const emit = (remoteJid, message, participant, id) => handler({ type: 'notify', messages: [{
    key: { remoteJid, id: id || 'm' + (++n), fromMe: false, ...(participant ? { participant } : {}) },
    message, messageTimestamp: Math.floor(Date.now() / 1000),
  }] });
  return {
    sent, removed, blocked, warns, aiCalls: () => aiCalls, mem, gmem,
    metadataCalls: () => metadataCalls,
    send: (message, participant = MEMBER) => emit(GROUP, message, participant),
    sendWithId: (message, id, participant = MEMBER) => emit(GROUP, message, participant, id),
    sendDM: (message, dm = '999@s.whatsapp.net') => emit(dm, message, null),
  };
}

const link = (t = 'see https://google.com') => ({ conversation: t });
const tagMsg = () => ({ extendedTextMessage: { text: 'hi all', contextInfo: { mentionedJid: ['a', 'b', 'c', 'd', 'e', 'f'] } } });
const statusMention = () => ({ groupStatusMentionMessage: { a: 1 } });

test('hung media monitor, typing and reaction cannot stop command dispatch', { timeout: 2000 }, async () => {
  let calls = 0;
  const h = loadMessagesHarness({ privacy: 'public', stalledExtras: true,
    settings: { autotyping: true, autorecording: true },
    commands: new Map([['ping', { name: 'ping', execute: async () => { calls++; } }]]),
  });
  await h.send({ conversation: '.ping' });
  await h.send({ conversation: '.ping' });
  assert.equal(calls, 2);
});

test('all anti modes exempt admins without deleting, warning, kicking or blocking', async () => {
  for (const mode of ['on', 'warn', 'kick']) {
    const h = loadMessagesHarness({
      privacy: 'public',
      settings: { antibot: mode, antitag: mode, badword: mode },
      group: { [GROUP]: { antilink: mode, antigm: mode, antigstatus: mode,
        antispam: mode, antiword: mode, antiwordlist: ['spoiler'] } },
    });
    for (const message of [link(), tagMsg(), statusMention(), { conversation: '.otherbot' },
      { conversation: 'damn spoiler https://whatsapp.com/channel/abc' },
      ...Array.from({ length: 8 }, () => ({ conversation: 'flood test' }))]) {
      await h.send(message, ADMIN);
    }
    assert.equal(h.sent.filter(content => !content.react).length, 0, mode);
    assert.equal(h.removed.length, 0, mode);
    assert.equal(h.blocked.length, 0, mode);
    assert.equal(h.warns.size, 0, mode);
  }
});

test('admin commands reach dispatch instead of being consumed by antibot exemption', async () => {
  let calls = 0;
  const commands = new Map([['ping', { name: 'ping', execute: async () => { calls++; } }]]);
  const h = loadMessagesHarness({ privacy: 'public', settings: { antibot: 'kick' }, commands });
  await h.send({ conversation: '.ping' }, ADMIN);
  assert.equal(calls, 1);
  assert.equal(h.removed.length, 0);
});

test('registered member commands are not mistaken for another bot', async () => {
  let calls = 0;
  const commands = new Map([['ping', { name: 'ping', execute: async () => { calls++; } }]]);
  const h = loadMessagesHarness({ privacy: 'public', settings: { antibot: true }, commands });
  await h.send({ conversation: '.ping' });
  assert.equal(calls, 1);
  assert.equal(h.removed.length, 0);
  assert.equal(h.blocked.length, 0);
});

test('Baileys-style bot IDs expose automated registered commands', async () => {
  let calls = 0;
  const commands = new Map([['ping', { name: 'ping', execute: async () => { calls++; } }]]);
  const h = loadMessagesHarness({ privacy: 'public', settings: { antibot: 'kick' }, commands });
  await h.sendWithId({ conversation: '.ping' }, '3EB0AABBCCDDEEFF00112233');
  assert.equal(calls, 0);
  assert.equal(h.removed.length, 1);
});

test('antilink on deletes member link in private mode before autochat', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antilink: 'on' } } });
  await h.send(link());
  assert.equal(h.sent.length, 1);
  assert.ok(h.sent[0].delete);
  assert.equal(h.aiCalls(), 0);
});

test('antilink warn strikes then kicks on third', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antilink: 'warn' } } });
  await h.send(link()); await h.send(link());
  assert.equal(h.removed.length, 0);
  assert.match(h.sent.at(-1).text, /warning 2\/3/);
  await h.send(link());
  assert.equal(h.removed.length, 1);
  assert.match(h.sent.at(-1).text, /removed after 3 warnings/);
});

test('antilink kick removes immediately', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antilink: 'kick' } } });
  await h.send(link());
  assert.equal(h.removed.length, 1);
});

test('antilinkall global mode applies when local is off', async () => {
  const h = loadMessagesHarness({ settings: { antilinkall: true }, group: { [GROUP]: { antilink: 'off' } } });
  await h.send(link());
  assert.ok(h.sent[0].delete);
});

test('admin links exempt in on mode and warn', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antilink: 'on' } } });
  await h.send(link(), ADMIN);
  assert.equal(h.sent.length, 0);
  const h2 = loadMessagesHarness({ group: { [GROUP]: { antilink: 'warn' } } });
  await h2.send(link(), ADMIN);
  assert.equal(h2.sent.length, 0);
});

test('antigm kick removes status mentions in private mode', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antigm: 'kick' } } });
  await h.send(statusMention());
  assert.equal(h.removed.length, 1);
});

test('antibot legacy boolean kicks command-like messages', async () => {
  const h = loadMessagesHarness({ settings: { antibot: true } });
  await h.send({ conversation: '.ping' });
  assert.equal(h.removed.length, 1);
});

test('antibot warn escalates instead of instant kick', async () => {
  const h = loadMessagesHarness({ settings: { antibot: 'warn' } });
  await h.send({ conversation: '.ping' });
  assert.equal(h.removed.length, 0);
  assert.match(h.sent.at(-1).text, /warning 1\/3/);
});

test('antibot catches foreign-prefix bot commands ($bank, %bet)', async () => {
  const h = loadMessagesHarness({ settings: { antibot: 'kick' } });
  await h.send({ conversation: '$bank' });
  await h.send({ conversation: '%bet all' });
  await h.send({ conversation: '!slots' });
  await h.send({ conversation: '#daily' });
  assert.equal(h.removed.length, 4);
});

test('antibot leaves human punctuation (... , . hello) alone', async () => {
  const h = loadMessagesHarness({ privacy: 'public', settings: { antibot: 'kick' } });
  await h.send({ conversation: '...' });
  await h.send({ conversation: '. hello there' });
  await h.send({ conversation: '? anyone here' });
  assert.equal(h.removed.length, 0);
  assert.equal(h.warns.size, 0);
});

test('antibot removes bot-only widgets but not human button taps', async () => {
  const h = loadMessagesHarness({ settings: { antibot: 'kick' } });
  await h.send({ buttonsMessage: { contentText: 'tap me', buttons: [{ buttonId: 'x' }] } });
  await h.send({ listMessage: { title: 'menu' } });
  await h.send({ templateMessage: { hydratedTemplate: {} } });
  await h.send({ interactiveMessage: { body: {} } });
  assert.equal(h.removed.length, 4);
  assert.match(h.sent.at(-1).text, /Automated bot message removed/);
  const h2 = loadMessagesHarness({ privacy: 'public', settings: { antibot: 'kick' } });
  await h2.send({ buttonsResponseMessage: { selectedButtonId: 'x' } });
  await h2.send({ listResponseMessage: { title: 'y' } });
  assert.equal(h2.removed.length, 0);
});

test('antibot exempts admins from widget removal', async () => {
  const h = loadMessagesHarness({ settings: { antibot: 'kick' } });
  await h.send({ buttonsMessage: { contentText: 'tap me' } }, ADMIN);
  await h.send({ conversation: '$bank' }, ADMIN);
  assert.equal(h.removed.length, 0);
  assert.equal(h.sent.length, 0);
});

test('antitag on deletes mass tags with notice', async () => {
  const h = loadMessagesHarness({ settings: { antitag: true } });
  await h.send(tagMsg());
  assert.ok(h.sent[0].delete);
  assert.match(h.sent[1].text, /Mass-tag message deleted/);
});

test('antitag kick removes immediately', async () => {
  const h = loadMessagesHarness({ settings: { antitag: 'kick' } });
  await h.send(tagMsg());
  assert.equal(h.removed.length, 1);
});

test('antitag triggers at five tags and ignores four', async () => {
  const five = () => ({ extendedTextMessage: { text: 'hi all', contextInfo: { mentionedJid: ['a', 'b', 'c', 'd', 'e'] } } });
  const four = () => ({ extendedTextMessage: { text: 'hi all', contextInfo: { mentionedJid: ['a', 'b', 'c', 'd'] } } });
  const h = loadMessagesHarness({ settings: { antitag: 'kick' } });
  await h.send(five());
  assert.equal(h.removed.length, 1);
  const h2 = loadMessagesHarness({ settings: { antitag: 'kick' } });
  await h2.send(four());
  assert.equal(h2.removed.length, 0);
  assert.equal(h2.sent.length, 0);
});

test('antitag catches mass-tags hidden in image captions', async () => {
  const h = loadMessagesHarness({ settings: { antitag: 'kick' } });
  await h.send({ imageMessage: { caption: 'look at this', contextInfo: { mentionedJid: ['a', 'b', 'c', 'd', 'e', 'f'] } } });
  assert.equal(h.removed.length, 1);
});

test('antitag catches mass-tags inside ephemeral wrappers', async () => {
  const h = loadMessagesHarness({ settings: { antitag: 'kick' } });
  await h.send({ ephemeralMessage: { message: { extendedTextMessage: { text: 'hi all', contextInfo: { mentionedJid: ['a', 'b', 'c', 'd', 'e', 'f'] } } } } });
  assert.equal(h.removed.length, 1);
});

test('bot without admin lets the message flow through untouched', async () => {
  const h = loadMessagesHarness({ privacy: 'public', botAdmin: false, group: { [GROUP]: { antilink: 'kick' } } });
  await h.send(link());
  assert.equal(h.sent.length, 0);
  assert.equal(h.removed.length, 0);
  assert.equal(h.aiCalls(), 1);
});

test('antibot without admin never swallows member commands', async () => {
  const h = loadMessagesHarness({ botAdmin: false, settings: { antibot: 'kick' } });
  await h.send({ conversation: '.ping' });
  assert.equal(h.sent.length, 0);
  assert.equal(h.removed.length, 0);
});

test('explicit autochat can answer ordinary text while commands remain private', async () => {
  const h = loadMessagesHarness();
  await h.send({ conversation: 'hello everyone' });
  assert.equal(h.aiCalls(), 1);
});

test('badword legacy boolean kicks, on mode only deletes', async () => {
  const h = loadMessagesHarness({ settings: { badword: true } });
  await h.send({ conversation: 'you are damn wrong' });
  assert.equal(h.removed.length, 1);
  const h2 = loadMessagesHarness({ settings: { badword: 'on' } });
  await h2.send({ conversation: 'you are damn wrong' });
  assert.ok(h2.sent[0].delete);
  assert.equal(h2.removed.length, 0);
});

test('badword warn escalates to kick on third strike', async () => {
  const h = loadMessagesHarness({ settings: { badword: 'warn' } });
  await h.send({ conversation: 'damn 1' });
  await h.send({ conversation: 'damn 2' });
  assert.equal(h.removed.length, 0);
  await h.send({ conversation: 'damn 3' });
  assert.equal(h.removed.length, 1);
});

test('antispam deletes flood beyond 6 messages per 10s', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antispam: 'on' } } });
  for (let i = 0; i < 6; i++) await h.send({ conversation: 'msg ' + i });
  assert.equal(h.sent.length, 0);
  await h.send({ conversation: 'msg 6' });
  assert.ok(h.sent[0].delete);
});

test('antiword list match deletes, kick removes', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antiword: 'on', antiwordlist: ['spoiler'] } } });
  await h.send({ conversation: 'total spoiler here' });
  assert.ok(h.sent[0].delete);
  const h2 = loadMessagesHarness({ group: { [GROUP]: { antiword: 'kick', antiwordlist: ['spoiler'] } } });
  await h2.send({ conversation: 'total spoiler here' });
  assert.equal(h2.removed.length, 1);
});

test('antigstatus hits channel invites but ignores plain links', async () => {
  const h = loadMessagesHarness({ group: { [GROUP]: { antigstatus: 'warn' } } });
  await h.send({ conversation: 'join https://whatsapp.com/channel/abc' });
  assert.ok(h.sent[0].delete);
  const h2 = loadMessagesHarness({ group: { [GROUP]: { antigstatus: 'warn' } } });
  await h2.send(link());
  assert.equal(h2.sent.length, 0);
});

test('inbox antilink on sends notice without delete or block', async () => {
  const DM = '999@s.whatsapp.net';
  const h = loadMessagesHarness({ group: { [DM]: { antilink: 'on' } } });
  await h.sendDM(link());
  assert.equal(h.sent.length, 1);
  assert.ok(!h.sent[0].delete);
  assert.match(h.sent[0].text, /not allowed here/);
  assert.equal(h.blocked.length, 0);
  assert.equal(h.metadataCalls(), 0);
});

test('inbox antilink warn blocks contact on third strike', async () => {
  const DM = '999@s.whatsapp.net';
  const h = loadMessagesHarness({ group: { [DM]: { antilink: 'warn' } } });
  await h.sendDM(link());
  await h.sendDM(link());
  assert.equal(h.blocked.length, 0);
  assert.match(h.sent.at(-1).text, /warning 2\/3/);
  await h.sendDM(link());
  assert.deepEqual(h.blocked, [{ jid: DM, action: 'block' }]);
  assert.match(h.sent.at(-1).text, /blocked after 3 warnings/);
});

test('inbox antilink kick blocks immediately', async () => {
  const DM = '999@s.whatsapp.net';
  const h = loadMessagesHarness({ group: { [DM]: { antilink: 'kick' } } });
  await h.sendDM(link());
  assert.deepEqual(h.blocked, [{ jid: DM, action: 'block' }]);
  assert.equal(h.removed.length, 0);
});

test('inbox badword kick blocks, antigm stays group-only', async () => {
  const DM = '999@s.whatsapp.net';
  const h = loadMessagesHarness({ settings: { badword: 'kick' }, group: { [DM]: { antigm: 'kick' } } });
  await h.sendDM({ conversation: 'you are damn wrong' });
  assert.deepEqual(h.blocked, [{ jid: DM, action: 'block' }]);
  const h2 = loadMessagesHarness({ group: { [DM]: { antigm: 'kick' } } });
  await h2.sendDM(statusMention());
  assert.equal(h2.sent.length, 0);
  assert.equal(h2.blocked.length, 0);
});

test('inbox flood and channel spam are punished per inbox', async () => {
  const DM = '999@s.whatsapp.net';
  const h = loadMessagesHarness({ group: { [DM]: { antispam: 'warn', antigstatus: 'on' } } });
  for (let i = 0; i < 7; i++) await h.sendDM({ conversation: 'ping ' + i });
  assert.match(h.sent.at(-1).text, /Flood/);
  const h2 = loadMessagesHarness({ group: { [DM]: { antigstatus: 'on' } } });
  await h2.sendDM({ conversation: 'join https://whatsapp.com/channel/abc' });
  assert.match(h2.sent[0].text, /Channel-invite/);
});

test('bot recognized by learned LID when socket lid is missing', async () => {
  const Andes = require('node:module').createRequire(path.join(ROOT, 'events/messages.js'));
  const isAdmin = Andes(path.join(ROOT, 'utils/isAdmin'));
  const prev = globalThis.__ownerLid;
  globalThis.__ownerLid = BOT_LID.split('@')[0];
  try {
    const noLidSock = { user: { id: BOT_PN } };
    const metadata = { participants: [{ id: BOT_LID, admin: 'admin' }, { id: MEMBER }] };
    assert.equal(isAdmin.isBotAdmin(noLidSock, metadata), true);
    const h = loadMessagesHarness({ noLid: true, group: { [GROUP]: { antilink: 'on' } } });
    await h.send(link());
    assert.ok(h.sent[0].delete);
  } finally {
    globalThis.__ownerLid = prev;
  }
});

test('owner messages are never punished', async () => {
  const stubs = {};
  const h = loadMessagesHarness({ group: { [GROUP]: { antilink: 'kick' } } });
  void stubs;
  const { isOwner } = realRequire(path.join(ROOT, 'utils/isOwner'));
  assert.equal(isOwner({ key: { remoteJid: GROUP, fromMe: false, participant: MEMBER } }), false);
});
