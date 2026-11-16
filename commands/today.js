const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function todayMonthDay() {
  const stamp = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.TIMEZONE || 'Africa/Nairobi',
    month: 'numeric', day: 'numeric',
  }).format(new Date());
  const [month, day] = stamp.split('/').map(part => Number(part));
  return { month, day };
}

function parseDate(input) {
  if (!input) return todayMonthDay();
  const match = String(input).trim().match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  return { month: Number(match[1]), day: Number(match[2]) };
}

function validateMonthDay(month, day) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return { month, day };
}

function pickEvents(events, limit = 3) {
  const list = (events || []).filter(event => event?.text && Number.isFinite(event.year));
  if (!list.length) return [];
  if (list.length <= limit) return list;
  const out = [];
  for (let index = 0; index < limit; index++) {
    out.push(list[Math.floor((index * list.length) / limit)]);
  }
  return out;
}

function formatEntries(list) {
  return list.map(event => `• ${event.year} — ${String(event.text).replace(/\s+/g, ' ').trim()}`);
}

async function fetchEvents(month, day, signal) {
  const stamp = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  const response = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${stamp}`, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

module.exports = {
  name: 'today',
  aliases: ['onthisday', 'history'],
  description: 'What happened on this day in history. Usage: .today [M-D]',
  parseDate, validateMonthDay, pickEvents, formatEntries,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    let monthDay;
    if (args.length) {
      monthDay = this.parseDate(args.join(' '));
      if (!monthDay) return reply('📌 Use a month-day like *11-16* or *5-3*.\nExample: .today 6-21');
    } else {
      monthDay = todayMonthDay();
    }
    const valid = validateMonthDay(monthDay.month, monthDay.day);
    if (!valid) return reply('📌 That date is not valid. Use a month-day like *11-16*.');
    let progress;
    try {
      progress = await reply(`⏳ Digging through history for ${MONTHS[valid.month - 1]} ${valid.day}...`);
      const data = await fetchEvents(valid.month, valid.day);
      const chosen = pickEvents(data?.events);
      if (!chosen.length) {
        await sock.sendMessage(jid, { text: '🔍 History is quiet for that date. Try another one.', edit: progress.key });
        return;
      }
      const lines = formatEntries(chosen);
      await sock.sendMessage(jid, {
        text: `📅 *On this day — ${MONTHS[valid.month - 1]} ${valid.day}*\n\n${lines.join('\n')}\n\n_via CELESTIA_`,
      }, { quoted: msg });
      await sock.sendMessage(jid, { text: '✅ Done!', edit: progress.key });
    } catch (error) {
      const text = 'The history lookup failed or timed out. Please try again later.';
      if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
      else await reply(`❌ ${text}`);
    }
  },
};
