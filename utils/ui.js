/**
 * utils/ui.js — CELESTIA's single visual language.
 *
 * Every bot surface (menu, football, notices) is built from these helpers —
 * one template, one indentation, one border width. Rules:
 *   ✦ branding / important heading · ◇ normal command · › value / information
 *   ╭ ╮ ╰ ╯ containers · • secondary information
 *   No `>` quote trees, no `|` beside semantics, no ``` fences, no padded
 *   columns (proportional phone fonts shatter them). Decorative separators
 *   stay ~28 visible chars for narrow mobile screens. Names are never
 *   truncated to protect alignment — each value gets its own safe line.
 */
'use strict';

// Mobile-safe rule: 20 strokes, 22 visible chars with corners.
// Corners must always open AND close on the same line — never emit a
// bare ╭/╰ line, and never center content with spaces.
const RULE = '─'.repeat(20);
const SEP = RULE;

function uptimeShort() {
  const s = Math.floor(process.uptime());
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

function renderHeader(title, subtitle) {
  const L = [`╭${RULE}╮`, `│ ✦ ${title} ✦`];
  if (subtitle) L.push(`│ ${subtitle}`);
  L.push(`╰${RULE}╯`);
  return L.join('\n');
}

function renderInfo(icon, label, value) {
  return `${icon} ${label} › ${value}`;
}

function renderDashboard({ title, subtitle, rows }) {
  const L = [renderHeader(title, subtitle), ''];
  for (const r of rows) L.push(renderInfo(r.icon, r.label, r.value));
  return L.join('\n');
}

function renderSectionTitle(text) {
  return `✦ ${text}`;
}

function renderCommand(name) {
  return `◇ ${name}`;
}

function renderCategory(icon, title, items) {
  const L = [`╭─ ${icon} ${title}`];
  for (const item of items) L.push(`│ ${item}`);
  L.push(`╰${SEP}`);
  return L.join('\n');
}

function renderCard(title, rows, footer) {
  const L = [`╭─ ${title}`];
  for (const row of rows) L.push(row === '' ? '│' : `│ ${row}`);
  if (footer) L.push(`│ ${footer}`);
  L.push(`╰${SEP}`);
  return L.join('\n');
}

function renderNotice(title, lines) {
  const L = [`✦ ${title}`];
  for (const line of lines) L.push(`• ${line}`);
  return L.join('\n');
}

function renderFooter(main, sub) {
  const L = [`✦ ${main}`];
  if (sub) L.push(`• ${sub}`);
  return L.join('\n');
}

function matchStatus(raw) {
  const st = String(raw || '').toUpperCase();
  if (st === 'FT' || st.includes('FINISH') || st.includes('FULL')) return { emoji: '✅', label: 'FULL TIME' };
  if (st === 'HT') return { emoji: '⏸️', label: 'HALF TIME' };
  if (st === 'NS' || st === '' || st.includes('SCHED')) return { emoji: '⏳', label: 'SCHEDULED' };
  return { emoji: '🔴', label: `LIVE • ${String(raw || 'LIVE')}` };
}

// One card per match. Team names are never truncated — each value
// (home, score, away, league) owns a safe line that wraps harmlessly.
function renderMatch({ home, away, homeScore, awayScore, status, league }) {
  const s = matchStatus(status);
  const hs = homeScore === null || homeScore === undefined ? '?' : String(homeScore);
  const as = awayScore === null || awayScore === undefined ? '?' : String(awayScore);
  return renderCard(`${s.emoji} ${s.label}`, [
    String(home || '?'),
    ` ${hs} ─ ${as}`,
    String(away || '?'),
    '',
    `🏆 ${league || 'Football'}`,
  ]);
}

// One standing row = name line + stats line. No columns, no truncation.
function renderStanding(pos, team, stats) {
  return [`› ${pos} · ${team}`, `  ${stats}`].join('\n');
}

function renderScorer(pos, name, detail) {
  return [`› ${pos} · ${name}`, `  ${detail}`].join('\n');
}

function renderFixture(home, away, when) {
  return renderCard(`⚽ ${home} vs ${away}`, [`🗓️ ${when}`]);
}

module.exports = {
  RULE,
  SEP,
  uptimeShort,
  renderHeader,
  renderInfo,
  renderDashboard,
  renderSectionTitle,
  renderCommand,
  renderCategory,
  renderCard,
  renderNotice,
  renderFooter,
  matchStatus,
  renderMatch,
  renderStanding,
  renderScorer,
  renderFixture,
};
