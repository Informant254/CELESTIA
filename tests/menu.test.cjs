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

async function renderBoxed(cmds) {
  const prev = settingsStore.get('menu_theme', 'boxed');
  settingsStore.set('menu_theme', 'boxed');
  try {
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
    const msg = { key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true } };
    await menu.execute(sock, msg, [], cmds);
    const texts = sent.map((s) => s.caption || s.text).filter(Boolean);
    assert.ok(texts.length, 'boxed menu must produce text');
    return texts.join('\n');
  } finally {
    settingsStore.set('menu_theme', prev);
  }
}

test('boxed full menu is one uniform quoted structure', async () => {
  const text = await renderBoxed(fakeCommands(['ping', 'menu', 'antilink', 'weather', 'epl']));
  const lines = text.split('\n').filter((l) => l.trim());
  assert.ok(lines.length > 10, 'menu should have many lines');
  for (const line of lines) {
    assert.ok(line.startsWith('> '), `non-uniform line: ${line.slice(0, 60)}`);
  }
  const headers = lines.filter((l) => l.includes('╭─❏'));
  const footers = lines.filter((l) => l.includes('╰──'));
  assert.ok(headers.length >= 2, 'header and realms share one box style');
  assert.ok(footers.length === headers.length, 'every opened box is closed the same way');
  assert.ok(!text.includes('┌') && !text.includes('└───'), 'no legacy unquoted box corners remain');
});

test('boxed realm section matches the full-menu section style', async () => {
  const prev = settingsStore.get('menu_theme', 'boxed');
  settingsStore.set('menu_theme', 'boxed');
  try {
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
    const msg = { key: { remoteJid: 't@s.whatsapp.net', id: 'm2', fromMe: true } };
    const cmds = fakeCommands(['ping', 'menu']);
    await menu.execute(sock, msg, ['general'], cmds);
    const text = sent.map((s) => s.caption || s.text).filter(Boolean).join('\n');
    for (const line of text.split('\n').filter((l) => l.trim())) {
      assert.ok(line.startsWith('> '), `non-uniform realm line: ${line.slice(0, 60)}`);
    }
  } finally {
    settingsStore.set('menu_theme', prev);
  }
});
