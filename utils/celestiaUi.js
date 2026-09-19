const RULE = '────────────────────────';

function safe(value, fallback = 'Unknown') {
  const text =
    value === undefined || value === null
      ? ''
      : String(value).trim();

  return text || fallback;
}

function shortUptime(seconds = process.uptime()) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));

  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;

  return `${s}s`;
}

function renderDashboard({
  user,
  prefix,
  mode,
  commandCount,
  realmCount,
  uptime,
}) {
  return [
    '╭─ ✦ *CELESTIA* ✦',
    '│ _THE MOST BEAUTIFUL BOT_',
    `╰${RULE}`,
    '',
    `👤 *User* › ${safe(user, 'Traveler')}`,
    `⚡ *Prefix* › ${safe(prefix, '.')}`,
    `🔐 *Mode* › ${safe(mode, 'public').toUpperCase()}`,
    `🧩 *Commands* › ${commandCount}`,
    `🌌 *Realms* › ${realmCount}`,
    `⏱ *Uptime* › ${safe(uptime, shortUptime())}`,
    '',
    '✦ *COMMAND CENTER* ✦',
  ].join('\n');
}

function renderCategory({
  icon = '✦',
  title,
  subtitle,
  commands = [],
  prefix = '',
  uppercase = false,
}) {
  const lines = [
    `╭─ ${icon} *${safe(title).toUpperCase()}*`,
  ];

  if (subtitle) {
    lines.push(`│ _${subtitle}_`);
  }

  if (subtitle && commands.length) {
    lines.push('│');
  }

  for (const command of commands) {
    const name = uppercase
      ? String(command).toUpperCase()
      : String(command).toLowerCase();

    lines.push(`│ ◇ ${prefix}${name}`);
  }

  lines.push(`╰${RULE}`);

  return lines.join('\n');
}

function statusBadge(status) {
  const st = safe(status, 'NS').toUpperCase();

  if (st === 'FT') return '✅ FULL TIME';

  if (['1T', '1H'].includes(st)) {
    return '🔴 LIVE • 1H';
  }

  if (['2T', '2H'].includes(st)) {
    return '🔴 LIVE • 2H';
  }

  if (['HT', 'HALF TIME'].includes(st)) {
    return '⏸️ HALF TIME';
  }

  if (['NS', 'NOT STARTED'].includes(st)) {
    return '⏳ NOT STARTED';
  }

  return `🔴 ${st}`;
}

function renderMatchCard({
  status,
  home,
  away,
  homeScore,
  awayScore,
  league,
  country,
}) {
  const competition = safe(league, '').trim();
  const nation = safe(country, '').trim();

  let compLine = competition;

  if (
    nation &&
    competition &&
    !competition.toLowerCase().includes(nation.toLowerCase())
  ) {
    compLine = `${competition} • ${nation}`;
  } else if (!competition) {
    compLine = nation;
  }

  const lines = [
    `╭─ ${statusBadge(status)}`,
    `│ 🏠 ${safe(home)}`,
    `│    *${safe(homeScore, '0')}  ─  ${safe(awayScore, '0')}*`,
    `│ ✈️ ${safe(away)}`,
  ];

  if (compLine) {
    lines.push('│');
    lines.push(`│ 🏆 ${compLine}`);
  }

  lines.push(`╰${RULE}`);

  return lines.join('\n');
}

function renderNotice(icon, title, body) {
  return [
    `╭─ ${icon} *${title}*`,
    `│ ${body}`,
    `╰${RULE}`,
  ].join('\n');
}

module.exports = {
  RULE,
  shortUptime,
  renderDashboard,
  renderCategory,
  renderMatchCard,
  renderNotice,
};
