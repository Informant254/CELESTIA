const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');

function loadCommand(file, axiosGet) {
  const filename = path.join(ROOT, 'commands', file);
  const realRequire = createRequire(filename);
  const stubs = { axios: { get: axiosGet } };
  const context = {
    require: (id) => (id in stubs ? stubs[id] : realRequire(id)),
    module: { exports: {} }, __dirname: path.join(ROOT, 'commands'), console,
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return context.module.exports;
}

function mockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (jid, content) => { sent.push(content); return { key: { id: 'k' + sent.length } }; },
  };
}

const mockMsg = () => ({ key: { remoteJid: 't@s.whatsapp.net', id: 'm1', fromMe: true } });
const finalText = (sock) => String(sock.sent.at(-1)?.text || '');

function assertNewLanguage(text, label) {
  assert.ok(!text.includes('```'), `${label}: monospace fence leaked`);
  assert.ok(!text.split('\n').some((l) => l.trim().startsWith('>')), `${label}: quote prefix leaked`);
  assert.ok(!text.includes('...'), `${label}: truncation marker leaked`);
}

test('livescore renders one card per match with full names', async () => {
  const cmd = loadCommand('livescore.js', async () => ({ data: { livescore: [
    { strHomeTeam: 'Nacional de Madeira', strAwayTeam: 'Deportivo Alavés', intHomeScore: 0, intAwayScore: 2, strStatus: '1H', strLeague: 'Portuguese Primeira Liga' },
    { strHomeTeam: 'Athletic Bilbao', strAwayTeam: 'Getafe', intHomeScore: null, intAwayScore: null, strStatus: 'NS', strLeague: 'Spanish La Liga' },
  ] } }));
  const sock = mockSock();
  await cmd.execute(sock, mockMsg(), []);
  const text = finalText(sock);
  assert.ok(text.includes('Nacional de Madeira') && text.includes('Deportivo Alavés'));
  assert.ok(text.includes('Portuguese Primeira Liga'));
  assert.ok(text.includes('╭─ 🔴 LIVE • 1H') && text.includes('? ─ ?') && text.includes('⏳ SCHEDULED'));
  assert.equal((text.match(/╰─+/g) || []).length, 2);
  assertNewLanguage(text, 'livescore');
});

test('epl table keeps full team names with one row per team', async () => {
  const cmd = loadCommand('epl.js', async () => ({ data: { table: [
    { intRank: '1', strTeam: 'Manchester United Football Club', intPlayed: '4', intGoalDifference: '5', intPoints: '12' },
  ] } }));
  const sock = mockSock();
  await cmd.execute(sock, mockMsg(), []);
  const text = finalText(sock);
  assert.ok(text.includes('Manchester United Football Club'), 'full name preserved');
  assert.ok(text.includes('› 1 · Manchester United Football Club'));
  assert.ok(text.includes('P4 · GD +5 · 12pts'));
  assertNewLanguage(text, 'epl');
});

test('standings fixtures render as dated cards', async () => {
  const cmd = loadCommand('standings.js', async () => ({ data: { events: [
    { strHomeTeam: 'Wolverhampton Wanderers', strAwayTeam: 'Nottingham Forest', strTimestamp: '2026-09-20T14:00:00' },
  ] } }));
  const sock = mockSock();
  await cmd.execute(sock, mockMsg(), ['epl']);
  const text = finalText(sock);
  assert.ok(text.includes('Wolverhampton Wanderers') && text.includes('Nottingham Forest'));
  assert.ok(text.includes('╭─ ⚽ Wolverhampton Wanderers vs Nottingham Forest'));
  assertNewLanguage(text, 'standings');
});

test('bundesliga scorers render full names with goal counts', async () => {
  const cmd = loadCommand('bundesligascorers.js', async () => ({ data: [
    { goalGetterName: 'Serhou Guirassy', goalCount: 9 },
  ] }));
  const sock = mockSock();
  await cmd.execute(sock, mockMsg(), []);
  const text = finalText(sock);
  assert.ok(text.includes('› 1 · Serhou Guirassy') && text.includes('9 goals'));
  assertNewLanguage(text, 'scorers');
});
