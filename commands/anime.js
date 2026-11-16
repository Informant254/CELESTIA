const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function trimSynopsis(text, limit = 320) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).replace(/\s+\S*$/, '')}...`;
}

function pickEntry(data, kind) {
  const list = Array.isArray(data?.data) ? data.data.filter(entry => entry && entry.title) : [];
  if (!list.length) return null;
  return list[0];
}

function cardFor(entry, kind) {
  if (!entry) return null;
  const episodes = kind === 'manga'
    ? (entry.chapters ? `${entry.chapters} chapters` : null)
    : (entry.episodes ? `${entry.episodes} episodes` : null);
  const genres = (entry.genres || []).map(g => g.name).filter(Boolean).slice(0, 4).join(', ');
  return {
    title: entry.title,
    cover: entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || null,
    caption: [
      `${kind === 'manga' ? '📚' : '📺'} *${entry.title}*`,
      `⭐ ${entry.score ?? '—'} · ${entry.type || kind} · ${entry.year || entry.published?.prop?.from?.year || '????'}`,
      [entry.status, episodes].filter(Boolean).join(' · '),
      genres ? `🏷️ ${genres}` : '',
      entry.synopsis ? `\n${trimSynopsis(entry.synopsis)}` : '',
      `\n_via CELESTIA_`,
    ].filter(Boolean).join('\n'),
  };
}

async function lookup(kind, query, signal) {
  const response = await fetch(`https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(query)}&limit=5`, {
    headers: { 'user-agent': BROWSER_UA },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function buildCommand(name, aliases, kind) {
  return {
    name,
    aliases,
    description: `Look up an anime or manga. Usage: .${name} <title>`,
    cardFor, pickEntry, trimSynopsis,
    async execute(sock, msg, args) {
      const jid = msg.key.remoteJid;
      const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
      const query = args.join(' ').trim();
      if (!query) return reply(`📌 Give me a title to look up.\nExample: .${name} Attack on Titan`);
      let progress;
      try {
        progress = await reply(`⏳ Searching ${kind} for *${query}*...`);
        const owner = `${jid}:${msg.key.participant || jid}`;
        await queue.run(async () => {
          const signal = AbortSignal.timeout(Math.min(cfg.DOWNLOAD_TIMEOUT_MS, 60000));
          const data = await lookup(kind, query, signal);
          const entry = pickEntry(data, kind);
          const card = cardFor(entry, kind);
          if (!card) {
            await sock.sendMessage(jid, { text: `🔍 Nothing found for *${query}*. Check the spelling and try again.`, edit: progress.key });
            return {};
          }
          let sent = false;
          if (card.cover) {
            try {
              const buffer = await downloadBuffer(card.cover, cfg.MAX_VIDEO_BYTES, 60000, 3, signal);
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
        const text = error.code === 'QUEUE_FULL' ? error.message : `The ${kind} lookup failed or timed out. Please try again later.`;
        if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
        else await reply(`❌ ${text}`);
      }
    },
  };
}

module.exports = [buildCommand('anime', ['anime'], 'anime'), buildCommand('manga', ['manga'], 'manga')];
