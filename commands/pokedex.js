const { detectMediaType, downloadBuffer } = require('../utils/downloader');
const cfg = require('../download/config');
const queue = require('../download/queue');
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const STAT_LABELS = {
  hp: 'HP', attack: 'ATK', defense: 'DEF',
  'special-attack': 'SpA', 'special-defense': 'SpD', speed: 'SPD',
};

function statBar(value) {
  const filled = Math.max(1, Math.min(10, Math.round((value / 150) * 10)));
  return `[${'█'.repeat(filled)}${'·'.repeat(10 - filled)}] ${value}`;
}

function cardFor(data) {
  if (!data?.id || !data?.name) return null;
  const types = (data.types || []).map(t => t.type.name).join(' / ');
  const abilities = (data.abilities || []).filter(a => !a.is_hidden).map(a => a.ability.name).join(', ');
  const hidden = (data.abilities || []).filter(a => a.is_hidden).map(a => a.ability.name);
  const stats = (data.stats || []).map(s => `${(STAT_LABELS[s.stat.name] || s.stat.name).padEnd(3)} ${statBar(s.base_stat)}`);
  const height = data.height != null ? `${(data.height / 10).toFixed(1)} m` : '—';
  const weight = data.weight != null ? `${(data.weight / 10).toFixed(1)} kg` : '—';
  const artwork = data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default;
  const name = String(data.name).replace(/^\w/, c => c.toUpperCase());
  return {
    title: `#${data.id}`,
    artwork,
    caption: [
      `🐾 *${name}* (#${data.id})`,
      types ? `🏷️ ${types}` : '',
      `📏 ${height} · ⚖️ ${weight}`,
      abilities ? `✨ ${abilities}${hidden.length ? ` (+${hidden.join(', ')} hidden)` : ''}` : '',
      stats.length ? `\n${stats.join('\n')}` : '',
      `\n_via CELESTIA_`,
    ].filter(Boolean).join('\n'),
  };
}

async function lookup(species, signal) {
  const clean = String(species || '').trim().toLowerCase();
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(clean)}`, {
    headers: { 'user-agent': BROWSER_UA },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

module.exports = {
  name: 'pokedex',
  aliases: ['dex', 'pokemon'],
  description: 'Look up a Pokémon. Usage: .pokedex <name or number>',
  cardFor, statBar,
  async execute(sock, msg, args) {
    const jid = msg.key.remoteJid;
    const reply = text => sock.sendMessage(jid, { text }, { quoted: msg });
    const query = args.join(' ').trim();
    if (!query) return reply('📌 Which Pokémon?\nExample: .pokedex gengar');
    let progress;
    try {
      progress = await reply(`⏳ Looking up *${query}*...`);
      const owner = `${jid}:${msg.key.participant || jid}`;
      await queue.run(async () => {
        const signal = AbortSignal.timeout(Math.min(cfg.DOWNLOAD_TIMEOUT_MS, 60000));
        const data = await lookup(query, signal);
        const card = cardFor(data);
        if (!card) {
          await sock.sendMessage(jid, { text: `🔍 No Pokémon called *${query}*. Check the name and try again.`, edit: progress.key });
          return {};
        }
        let sent = false;
        if (card.artwork) {
          try {
            const buffer = await downloadBuffer(card.artwork, cfg.MAX_VIDEO_BYTES, 60000, 3, signal);
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
      const text = error.code === 'QUEUE_FULL' ? error.message : 'The Pokédex lookup failed or timed out. Please try again later.';
      if (progress?.key) await sock.sendMessage(jid, { text: `❌ ${text}`, edit: progress.key });
      else await reply(`❌ ${text}`);
    }
  },
};
