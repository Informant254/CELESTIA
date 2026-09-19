const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const menu = require(path.join(ROOT, 'commands/menu'));
const settingsStore = require(path.join(ROOT, 'utils/settingsStore'));

function fakeCommands(names) {
  const m = new Map();
  for (const n of names) m.set(n, { name: n, description: `${n} does things well.`, aliases: [] });
  return m;
}

async function runMenu(cmds, args, pushName = 'Boss') {
  const prev = settingsStore.get('menu_theme', 'boxed');
  settingsStore.set('menu_theme', 'boxed');
  try {
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
    const msg = { key: { remoteJid: 't@s.whatsapp.net', id: 'm' + Math.random(), fromMe: true }, pushName };
    await menu.execute(sock, msg, args, cmds);
    for (const s of sent) {
      if (s.image) assert.ok(!s.caption || s.caption.length <= 1024, 'image captions must stay within WhatsApp limits');
      if (s.text) assert.ok(s.text.length <= 12000, 'text chunks must stay within send limits');
    }
    return sent;
  } finally {
    settingsStore.set('menu_theme', prev);
  }
}

const textsOf = (sent) => sent.map((s) => s.caption || s.text).filter(Boolean).join('\n');

test('main menu renders dashboard plus uniform categories', async () => {
  const names = ['ping', 'menu', 'celestia', 'recall', 'antibot', 'antilink', 'mode', 'fullpp', 'restart', 'epl', 'livescore'];
  const sent = await runMenu(fakeCommands(names), []);
  assert.ok(sent.some((s) => s.image && !s.caption), 'CELESTIA image rides first, untouched, on its own bubble');
  const text = textsOf(sent);
  assert.ok(!text.includes('```'), 'no monospace fences in the new menu');
  assert.ok(!text.split('\n').some((l) => l.trim().startsWith('>')), 'no quote-tree prefixes in the new menu');
  assert.ok(text.includes('╭─ ✦ *CELESTIA* ✦'));
  assert.ok(text.includes('│ _THE MOST BEAUTIFUL BOT_'));
  assert.ok(text.includes('👤 *User* › Boss') && text.includes('⚡ *Prefix* › .'));
  assert.ok(text.includes('✦ *COMMAND CENTER* ✦'));
  assert.ok(text.includes('╭─ 💫 *HER HEART*'));
  assert.ok(text.includes('│ _the soul that stays*') || text.includes('│ _the soul that stays_'));
  assert.ok(text.includes('│ ◇ celestia'));
  assert.ok(text.includes('✦ _Howl of the Wolf → Light of the Stars_ ✦'));
  for (const n of names) assert.ok(text.includes(`◇ ${n}`), `command missing from menu: ${n}`);
});

test('realm views reuse the category template with prefixed rows', async () => {
  const cmds = fakeCommands(['ping', 'menu', 'mode', 'public', 'self', 'prefix', 'fullpp', 'restart']);
  const sent = await runMenu(cmds, ['owner']);
  const text = textsOf(sent);
  assert.ok(text.includes('╭─ 👑 *OWNER CROWN*'));
  assert.ok(text.includes('│ ◇ .mode'), 'realm rows carry the prefix');
  assert.ok(text.includes('↩ Back: .menu'));
  assert.ok(!text.includes('```'));
});

test('long category names keep the exact header template', async () => {
  const cmds = fakeCommands(['spam', 'kill', 'kill2', 'clear']);
  const text = textsOf(await runMenu(cmds, ['nuke']));
  const header = text.split('\n').find((l) => l.includes('WEAPONS OF MASS DESTRUCTION'));
  assert.ok(header && /^╭─ 💀 \*WEAPONS OF MASS DESTRUCTION\*$/.test(header));
  for (const line of text.split('\n').filter((l) => l.trim())) {
    assert.ok(line.length <= 80, `overlong line breaks mobile layout: ${line.slice(0, 70)}`);
  }
});
