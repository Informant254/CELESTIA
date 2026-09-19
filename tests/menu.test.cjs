const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const menu = require(path.join(ROOT, 'commands/menu'));
const settingsStore = require(path.join(ROOT, 'utils/settingsStore'));

function fakeCommands(names) {
  const map = new Map();
  for (const entry of names) {
    const name = typeof entry === 'string' ? entry : entry.name;
    const command = {
      name,
      description: `${name} does useful things without wasting your time.`,
      aliases: typeof entry === 'string' ? [] : (entry.aliases || []),
    };
    map.set(name.toLowerCase(), command);
    for (const alias of command.aliases) map.set(alias.toLowerCase(), command);
  }
  return map;
}

async function runMenu(commands, args, options = {}) {
  const previousTheme = settingsStore.get('menu_theme', 'boxed');
  const previousNative = settingsStore.get('menu_native', false);
  settingsStore.set('menu_theme', options.theme || 'boxed');
  settingsStore.set('menu_native', false);
  try {
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
    const msg = { key: { remoteJid: 't@s.whatsapp.net', id: `m${Math.random()}`, fromMe: true }, pushName: options.pushName || 'Boss' };
    await menu.execute(sock, msg, args, commands, async (text) => sent.push({ text }));
    for (const message of sent) {
      assert.ok(!message.caption, 'banner must remain bare and unchanged');
      if (message.text) {
        assert.ok(message.text.length <= 12000, 'text stays within WhatsApp limits');
        for (const line of message.text.split('\n').filter(Boolean)) {
          assert.ok(line.length <= 80, `mobile line too long: ${line}`);
        }
      }
    }
    return sent;
  } finally {
    settingsStore.set('menu_theme', previousTheme);
    settingsStore.set('menu_native', previousNative);
  }
}

const textOf = (sent) => sent.map((message) => message.text).filter(Boolean).join('\n');
const FIXTURE = fakeCommands([
  { name: 'ping', aliases: ['p', 'latency'] }, 'menu', 'celestia', 'recall', 'weather',
  'game', 'livescore', 'ai', 'sticker', 'statussuite', 'locate', 'antibot',
  'mode', 'restart', 'autochat', 'mysterycmd',
]);

test('home is a compact observatory with five constellation cards', async () => {
  const sent = await runMenu(FIXTURE, []);
  assert.ok(sent[0]?.image, 'CELESTIA banner sends first on its own');
  const text = textOf(sent);
  assert.match(text, /CELESTIA \/ OBSERVATORY/);
  assert.match(text, /Welcome back, \*Boss\*/);
  assert.match(text, /01  ☀️ \*INNER ORBIT\*/);
  assert.match(text, /02  🏟️ \*THE ARENA\*/);
  assert.match(text, /03  ✦ \*CREATOR FORGE\*/);
  assert.match(text, /04  🌐 \*WORLD NEXUS\*/);
  assert.match(text, /05  ♛ \*CROWN CONTROL\*/);
  assert.match(text, /\.menu find <word>/);
  assert.ok(!text.includes('*\.ping*'), 'home stays navigable instead of dumping every command');
});

test('constellation submenu lists only its realm cards with breadcrumbs', async () => {
  const text = textOf(await runMenu(FIXTURE, ['orbit']));
  assert.match(text, /CELESTIA \/ INNER ORBIT/);
  assert.match(text, /HOME  ›  ORBIT/);
  assert.match(text, /💫 \*HER HEART\*/);
  assert.match(text, /🌦️ \*DAY INTEL\*/);
  assert.match(text, /Open › \.menu orbit heart/);
  assert.ok(!text.includes('GROUP SECURITY'));
});

test('realm pages show descriptions, pagination and canonical navigation', async () => {
  const many = fakeCommands(['open', 'close', 'mute', 'unmute', 'amute', 'aunmute', 'promote', 'demote', 'kick', 'add', 'join']);
  const first = textOf(await runMenu(many, ['crown', 'group', '1']));
  assert.match(first, /HOME  ›  CROWN  ›  GROUP/);
  assert.match(first, /\*\.open\*/);
  assert.match(first, /open does useful things/);
  assert.match(first, /page 1\/2/);
  assert.match(first, /› \.menu crown group 2/);
  const second = textOf(await runMenu(many, ['crown', 'group', '2']));
  assert.match(second, /\*\.add\*/);
  assert.match(second, /‹ \.menu crown group 1/);
});

test('third-level command profiles work through canonical and legacy paths', async () => {
  const nested = textOf(await runMenu(FIXTURE, ['nexus', 'general', 'ping']));
  assert.match(nested, /CELESTIA \/ SIGNAL PROFILE/);
  assert.match(nested, /HOME  ›  NEXUS  ›  GENERAL  ›  PING/);
  assert.match(nested, /\*Aliases\*/);
  assert.match(nested, /\.p/);
  assert.match(nested, /\.latency/);
  assert.match(nested, /\*Launch\* › \.ping/);

  const legacy = textOf(await runMenu(FIXTURE, ['general', 'ping']));
  assert.match(legacy, /CELESTIA \/ SIGNAL PROFILE/);
});

test('atlas and search preserve paths into deeper menus', async () => {
  const atlas = textOf(await runMenu(FIXTURE, ['all', '1']));
  assert.match(atlas, /CELESTIA \/ COMPLETE ATLAS/);
  assert.match(atlas, /\.menu orbit heart/);
  assert.match(atlas, /› \.menu all 2/);

  const search = textOf(await runMenu(FIXTURE, ['find', 'latency']));
  assert.match(search, /1 match.*latency/);
  assert.match(search, /\*\.ping\*/);
  assert.match(search, /\.menu nexus general ping/);
});

test('uncategorized commands are never lost and appear in utility', async () => {
  const text = textOf(await runMenu(FIXTURE, ['utility']));
  assert.match(text, /\*\.mysterycmd\*/);
});

test('all six themes share the complete hierarchy and change only the accent', async () => {
  const themes = {
    boxed: '✦', celestial: '✧', constellation: '⋆', neon: '◆', zen: '•', grimoire: '❖',
  };
  for (const [theme, glyph] of Object.entries(themes)) {
    const text = textOf(await runMenu(FIXTURE, ['nexus', 'general'], { theme }));
    assert.ok(text.startsWith(`╭─ ${glyph} *CELESTIA / GENERAL & INFO*`), `${theme} accent missing`);
    assert.match(text, /HOME  ›  NEXUS  ›  GENERAL/);
    assert.match(text, /Details › \.menu nexus general <command>/);
  }
});
