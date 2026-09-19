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
      if (s.text) assert.ok(s.text.length <= 60000, 'text bubbles must stay sendable');
    }
    return sent;
  } finally {
    settingsStore.set('menu_theme', prev);
  }
}

const textsOf = (sent) => sent.map((s) => s.caption || s.text).filter(Boolean).join('\n');
const HEADER_RE = /^╭─ \S+ .+$/;
const ROW_RE = /^│ ◇ [a-z0-9_.+\-]+$/;
const FOOTER = /^╰─+$/;

function assertSingleTemplate(text, label, minSections = 2) {
  const lines = text.split('\n').filter((l) => l.trim());
  let sections = 0;
  let i = 0;
  const sectionBlocks = [];
  let current = null;
  for (const line of lines) {
    if (HEADER_RE.test(line)) { current = [line]; continue; }
    if (FOOTER.test(line)) {
      if (current) { current.push(line); sectionBlocks.push(current); sections++; }
      current = null;
      continue;
    }
    if (current) {
      assert.ok(ROW_RE.test(line), `${label}: off-template row: ${line.slice(0, 70)}`);
      current.push(line);
    }
  }
  assert.ok(sections >= minSections, `${label}: expected sectioned categories, got ${sections}`);
  return sectionBlocks;
}

test('main menu uses one template: banner, dashboard, uniform categories', async () => {
  const names = ['ping', 'menu', 'celestia', 'recall', 'antibot', 'antilink', 'mode', 'fullpp', 'restart', 'epl', 'livescore'];
  const sent = await runMenu(fakeCommands(names), []);
  assert.ok(sent.some((s) => s.image && !s.caption), 'CELESTIA image rides first, untouched, on its own bubble');
  const text = textsOf(sent);
  assert.ok(!text.includes('```'), 'no monospace fences in the new menu');
  assert.ok(!text.split('\n').some((l) => l.trim().startsWith('>')), 'no quote-tree prefixes in the new menu');
  assert.ok(text.includes('✦ CELESTIA ✦') && text.includes('COMMAND INTERFACE'));
  assert.ok(text.includes('👤 User › Boss') && text.includes('⚡ Prefix › .'));
  assert.ok(text.includes('✦ COMMAND CENTER'));
  const blocks = assertSingleTemplate(text, 'menu');
  const rendered = new Set(blocks.flatMap((b) => b.filter((l) => ROW_RE.test(l)).map((l) => l.slice(4))));
  for (const n of names) assert.ok(rendered.has(n), `command missing from menu: ${n}`);
});

test('atlas and realm views reuse the same category template', async () => {
  const cmds = fakeCommands(['ping', 'menu', 'mode', 'public', 'self', 'prefix', 'fullpp', 'restart']);
  const atlas = textsOf(await runMenu(cmds, ['all']));
  assertSingleTemplate(atlas, 'atlas');
  const realm = textsOf(await runMenu(cmds, ['owner']));
  const blocks = assertSingleTemplate(realm, 'realm', 1);
  assert.equal(blocks.length, 1);
  const full = textsOf(await runMenu(cmds, []));
  assert.ok(full.includes(blocks[0].join('\n')), 'realm sections are byte-identical inside the full menu');
});

test('long category names keep the exact header template', async () => {
  const cmds = fakeCommands(['spam', 'kill', 'kill2', 'clear']);
  const text = textsOf(await runMenu(cmds, ['nuke']));
  const header = text.split('\n').find((l) => l.includes('WEAPONS OF MASS DESTRUCTION'));
  assert.ok(header && HEADER_RE.test(header), 'long titles keep the exact header template');
  for (const line of text.split('\n').filter((l) => l.trim())) {
    assert.ok(line.length <= 80, `overlong line breaks mobile layout: ${line.slice(0, 70)}`);
  }
});
