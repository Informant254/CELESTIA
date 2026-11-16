const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');
const DATASET_URL = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json';
const DATASET_TTL = 24 * 60 * 60 * 1000;
let dataset = null;
let datasetAt = 0;

async function loadDataset(signal) {
  if (dataset && Date.now() - datasetAt < DATASET_TTL) return dataset;
  const response = await fetch(DATASET_URL, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) throw new Error('The country dataset is malformed.');
  dataset = data;
  datasetAt = Date.now();
  return dataset;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[.,]/g, '');
}

function lookup(name, source) {
  const query = normalizeName(name);
  if (!query) return null;
  const list = source || dataset || [];
  const byCommon = list.find(entry => normalizeName(entry?.name?.common) === query);
  const byOfficial = list.find(entry => normalizeName(entry?.name?.official) === query);
  const byCode = list.find(entry => String(entry?.cca2 || '').toLowerCase() === query);
  const byAlt = list.find(entry => (entry?.altSpellings || []).some(alt => normalizeName(alt) === query));
  const byPrefix = list.find(entry => normalizeName(entry?.name?.common).startsWith(query)
    || normalizeName(entry?.name?.official).startsWith(query));
  return byCommon || byOfficial || byCode || byAlt || byPrefix || null;
}

function cardFor(entry) {
  if (!entry?.name?.common || !entry?.cca2) return null;
  const capital = (entry.capital || []).join(', ') || '—';
  const currencies = Object.entries(entry.currencies || {})
    .map(([, value]) => [value?.name, value?.symbol].filter(Boolean).join(' '))
    .join(', ') || '—';
  const languages = Object.values(entry.languages || {}).join(', ') || '—';
  const population = typeof entry.population === 'number'
    ? new Intl.NumberFormat('en-US').format(entry.population) : '—';
  const area = typeof entry.area === 'number'
    ? `${new Intl.NumberFormat('en-US').format(Math.round(entry.area))} km²` : '—';
  return {
    flag: `https://flagcdn.com/w1280/${entry.cca2.toLowerCase()}.png`,
    caption: [
      `${entry.flag || '🌍'} *${entry.name.common}* — ${entry.name.official}`,
      `🏛️ Capital: ${capital}`,
      `👥 Population: ${population}`,
      `📐 Area: ${area}`,
      `🗺️ ${entry.region || '—'}${entry.subregion ? ` · ${entry.subregion}` : ''}`,
      `💱 ${currencies}`,
      `🗣️ ${languages}`,
      `\n_via CELESTIA_`,
    ].join('\n'),
  };
}

module.exports = {
  name: 'country',
  aliases: ['countryinfo', 'flag'],
  description: 'Country facts with flag. Usage: .country <name>',
  cardFor, lookup, loadDataset,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    const query = args.join(' ').trim();
    if (!query) return reply('📌 Which country?\nExample: .country kenya');
    let progress;
    try {
      progress = await reply(`⏳ Looking up *${query}*...`);
      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const signal = AbortSignal.timeout(Math.min(cfg.DOWNLOAD_TIMEOUT_MS, 60000));
        const entry = lookup(query, await loadDataset(signal));
        const card = cardFor(entry);
        if (!card) {
          await sock.sendMessage(jid, { text: `🔍 No country found for *${query}*. Check the name and try again.`, edit: progress.key });
          return {};
        }
        let sent = false;
        if (card.flag) {
          try {
            const buffer = await downloadBuffer(card.flag, cfg.MAX_VIDEO_BYTES, 60000, 3, signal);
            const type = detectMediaType(buffer);
            if (type === 'image' || type === 'gif') {
              await sock.sendMessage(jid, { image: buffer, caption: card.caption }, { quoted: msg });
              sent = true;
            }
          } catch { if (signal.aborted) throw signal.reason; }
        }
        if (!sent) await sock.sendMessage(jid, { text: card.caption }, { quoted: msg });
        await sock.sendMessage(jid, { text: '✅ Done!', edit: progress.key });
        return {};
      }, owner);
    } catch (error) {
      const text = error.code === 'QUEUE_FULL' ? error.message : 'The country lookup failed or timed out. Please try again later.';
      if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
      else await reply(`❌ ${text}`);
    }
  },
};
