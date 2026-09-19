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

async function runMenu(cmds, args) {
  const prev = settingsStore.get('menu_theme', 'boxed');
  settingsStore.set('menu_theme', 'boxed');
  try {
    const sent = [];
    const sock = { sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'x' } }; } };
    const msg = { key: { remoteJid: 't@s.whatsapp.net', id: 'm' + Math.random(), fromMe: true } };
    await menu.execute(sock, msg, args, cmds);
    for (const s of sent) {
      if (s.image) assert.ok(!s.caption || s.caption.length <= 1024, 'image captions must stay within WhatsApp limits');
      if (s.text) assert.ok(s.text.length <= 60000, 'text bubbles must stay sendable');
    }
    return sent;
  } finally {
    settingsStore.set('menu_theme', prev);
  }
}

const textsOf = (sent) => sent.map((s) => s.caption || s.text).filter(Boolean).join('\n');
const HEADER_RE = /^> ╭─❏ \*[^*]+\* ❏$/;
const ROW_RE = /^> │ (?:```[A-Z0-9_+\-]+```|[^`]+)$/;
const FOOTER = '> ╰─────────────────';

function assertSingleTemplate(text, label) {
  const lines = text.split('\n').filter((l) => l.trim());
  assert.ok(lines.length > 5, `${label}: menu should have many lines`);
  for (const line of lines) {
    const ok = HEADER_RE.test(line) || ROW_RE.test(line) || line === FOOTER;
    assert.ok(ok, `${label}: off-template line: ${line.slice(0, 70)}`);
  }
  const headers = lines.filter((l) => HEADER_RE.test(l));
  const footers = lines.filter((l) => l === FOOTER);
  assert.equal(footers.length, headers.length, `${label}: every opened box closes identically`);
  return { headers, footers };
}

test('boxed full menu uses one template for every section', async () => {
  const sent = await runMenu(fakeCommands(['ping', 'menu', 'antilink', 'weather', 'epl', 'mode', 'fullpp', 'spam']), []);
  assert.ok(sent.some((s) => s.image && !s.caption), 'banner rides on its own bubble');
  const { headers } = assertSingleTemplate(textsOf(sent), 'full');
  assert.ok(headers.length >= 2, 'header and realms share one box style');
  assert.ok(!textsOf(sent).includes('┌'), 'no legacy unquoted box corners remain');
});

test('boxed atlas and realm views reuse the same template', async () => {
  const cmds = fakeCommands(['ping', 'menu', 'antilink', 'weather', 'mode', 'public', 'self', 'prefix', 'fullpp', 'restart']);
  const atlas = textsOf(await runMenu(cmds, ['all']));
  assertSingleTemplate(atlas, 'atlas');
  const realm = textsOf(await runMenu(cmds, ['owner']));
  assertSingleTemplate(realm, 'realm');
  const full = textsOf(await runMenu(cmds, []));
  const realmHeader = realm.split('\n')[0];
  assert.ok(full.includes(realmHeader), 'realm sections are byte-identical inside the full menu');
});

test('long category names render cleanly in one template', async () => {
  const cmds = fakeCommands(['spam', 'kill', 'kill2', 'clear', 'ping']);
  const text = textsOf(await runMenu(cmds, ['nuke']));
  const header = text.split('\n').find((l) => l.includes('WEAPONS OF MASS DESTRUCTION'));
  assert.ok(header && HEADER_RE.test(header), 'long titles keep the exact header template');
  for (const line of text.split('\n').filter((l) => l.trim())) {
    assert.ok(line.length <= 80, `overlong line breaks alignment: ${line.slice(0, 70)}`);
  }
});
