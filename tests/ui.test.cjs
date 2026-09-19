const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ui = require(path.join(ROOT, 'utils/ui'));

test('separators stay within mobile width', () => {
  assert.ok(ui.SEP.length <= 30, `separator too wide: ${ui.SEP.length}`);
  for (const s of [ui.renderHeader('A', 'B'), ui.renderCategory('i', 'T', ['x']), ui.renderCard('t', ['r'])]) {
    for (const line of s.split('\n')) {
      if (/^[╭╰]/.test(line)) assert.ok(line.length <= 32, `wide border: ${line}`);
    }
  }
});

test('symbol vocabulary is consistent', () => {
  const h = ui.renderHeader('CELESTIA', 'COMMAND INTERFACE');
  assert.ok(h.includes('✦ CELESTIA ✦'));
  assert.ok(ui.renderCommand('ping') === '◇ ping');
  assert.ok(ui.renderInfo('⚡', 'Prefix', '.') === '⚡ Prefix › .');
  const n = ui.renderNotice('T', ['a']);
  assert.ok(n.startsWith('✦ T') && n.includes('• a'));
  const f = ui.renderFooter('main', 'sub');
  assert.ok(f.startsWith('✦ main') && f.includes('• sub'));
});

test('no legacy quote trees, fences or padded columns', () => {
  const samples = [
    ui.renderDashboard({ title: 'T', subtitle: 'S', rows: [{ icon: 'i', label: 'L', value: 'V' }] }),
    ui.renderSectionTitle('X'),
    ui.renderCategory('i', 'T', [ui.renderCommand('ping')]),
    ui.renderCard('t', ['r1', '', 'r2']),
    ui.renderNotice('T', ['a', 'b']),
    ui.renderFooter('m'),
    ui.renderMatch({ home: 'A', away: 'B', homeScore: 1, awayScore: 2, status: '1H', league: 'L' }),
    ui.renderStanding(1, 'Team', 'P1 · GD +1 · 3pts'),
    ui.renderScorer(1, 'Name', '5 goals'),
    ui.renderFixture('A', 'B', 'Sat'),
  ];
  for (const s of samples) {
    for (const line of s.split('\n')) {
      assert.ok(!line.startsWith('>'), `quote prefix leaked: ${line}`);
      assert.ok(!line.includes('```'), `fence leaked: ${line}`);
      if (line.includes('│')) {
        assert.ok(/^│( .*)?$/.test(line), `pipe outside container row: ${line}`);
      }
      if (/^[╭╰]/.test(line)) assert.ok(line.length <= 32, `wide border: ${line}`);
    }
    assert.ok(!/ {2,}[A-Z]/.test(s.split('\n').find((l) => l.includes('›')) || ''), 'padded columns leaked');
  }
});

test('match cards never truncate and keep one value per line', () => {
  const home = 'Nacional de Madeira';
  const away = 'Deportivo Alavés';
  const card = ui.renderMatch({ home, away, homeScore: 0, awayScore: 2, status: '1H', league: 'Portuguese Primeira Liga' });
  assert.ok(card.includes(home) && card.includes(away), 'full team names preserved');
  assert.ok(card.includes('Portuguese Primeira Liga'));
  const lines = card.split('\n');
  assert.ok(lines[0].startsWith('╭─ 🔴 LIVE • 1H'));
  assert.ok(lines.at(-1).startsWith('╰'));
  assert.ok(!card.includes('...'), 'no truncation markers');
});

test('match statuses map correctly', () => {
  assert.deepEqual(ui.matchStatus('FT'), { emoji: '✅', label: 'FULL TIME' });
  assert.deepEqual(ui.matchStatus('HT'), { emoji: '⏸️', label: 'HALF TIME' });
  assert.deepEqual(ui.matchStatus('NS'), { emoji: '⏳', label: 'SCHEDULED' });
  const live = ui.matchStatus("78'");
  assert.equal(live.emoji, '🔴');
  const ft = ui.renderMatch({ home: 'A', away: 'B', homeScore: 2, awayScore: 2, status: 'FT', league: 'L' });
  assert.ok(ft.includes('✅ FULL TIME') && ft.includes('2 ─ 2'));
  const na = ui.renderMatch({ home: 'A', away: 'B', homeScore: null, awayScore: null, status: 'NS', league: 'L' });
  assert.ok(na.includes('? ─ ?'));
});

test('standing and scorer rows keep full names', () => {
  const s = ui.renderStanding(1, 'Bayer 04 Leverkusen', 'P4 · GD +9 · 10pts');
  assert.ok(s.includes('Bayer 04 Leverkusen'));
  assert.deepEqual(s.split('\n').length, 2);
  const g = ui.renderScorer(1, 'Serhou Guirassy', '9 goals');
  assert.ok(g.includes('Serhou Guirassy'));
});
