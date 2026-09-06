const fs = require('fs');
const path = require('path');
const figlet = require('figlet');
const wolfTech = require('../utils/wolfTech');
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

// ═══════════════════════════════════════════════════
// THE REALMS — shared data, rendered by 4 themes
// ═══════════════════════════════════════════════════
const CATEGORIES = [
  { key: 'heart', icon: '💫', title: 'HER HEART', poem: 'the soul that stays', cmds: ['celestia', 'recall', 'goodnight', 'goodmorning', 'wish', 'watchover', 'remind', 'capsule', 'habit'] },
  { key: 'intel', icon: '🌦️', title: 'DAY INTEL', poem: 'the pulse of your world, hourly', cmds: ['weather', 'wx', 'forecast', 'pray', 'salah', 'crypto', 'coins', 'fx', 'rate', 'briefing', 'herald', 'daily', 'roast', 'burn', 'wolffire'] },
  { key: 'mystic', icon: '🔮', title: 'MYSTIC', poem: 'the cards, the stars, the numbers', cmds: ['tarot', 'cards', 'pull', 'horoscope', 'zodiacread', 'stars', 'numerology', 'numbers', 'fortune', 'cookie', 'omen', 'zodiac'] },
  { key: 'space', icon: '🚀', title: 'SPACE', poem: 'the sky is not the limit', cmds: ['apod', 'spacepic', 'astropic', 'mars', 'iss', 'station'] },
  { key: 'wellness', icon: '🧘', title: 'WELLNESS', poem: 'she guards the vessel', cmds: ['wellness', 'health', 'fit'] },
  { key: 'business', icon: '💼', title: 'BUSINESS HUB', poem: 'the honest ledger', cmds: ['invoice', 'inv', 'expense', 'expenses', 'spend'] },
  { key: 'travel', icon: '✈️', title: 'TRAVEL KIT', poem: 'go far, pack light', cmds: ['travel', 'trip', 'packing'] },
  { key: 'game', icon: '🎮', title: 'THE GAME', poem: 'the legend you live inside', cmds: ['level', 'rank', 'xp', 'legend', 'pet', 'wolf', 'companion', 'daily', 'claim', 'dailybonus', 'quests', 'quest', 'dailies', 'loot', 'crate', 'box', 'casino', 'bet', 'slots', 'secrets', 'eastereggs', 'mystery'] },
  { key: 'status', icon: '📱', title: 'STATUS & VAULT', poem: 'beyond the normal, quietly', cmds: ['statussuite', 'ssuite', 'studio', 'setstatus', 'poststatus', 'status', 'statusview', 'whoviewed', 'statusreact', 'sreact', 'ghostarchive', 'garchive', 'statusarchive', 'vault', 'vvault', 'captures', 'vv', 'vv2', 'ghost', 'anon', 'anonymous'] },
  { key: 'atlas', icon: '🌍', title: 'WORLD ATLAS', poem: 'the world, mapped and alive', cmds: ['locate', 'where', 'geo', 'place', 'maps', 'senderlocate', 'slocate', 'whereis', 'locateuser', 'webcam', 'cam', 'worldcam', 'livecam', 'satellite', 'sat', 'satspy', 'orbital', 'ipinfo', 'geoip', 'ip', 'dnsrecon', 'whois'] },
  { key: 'portal', icon: '🌀', title: 'THE PORTAL', poem: 'insanely good free websites, alive', cmds: ['portal', 'sites', 'webportal', 'goodies'] },
  { key: 'cyber', icon: '⚔️', title: 'CYBER FORTRESS', poem: 'the wolf guards the den', cmds: ['cyberfort', 'kev', 'cve', 'breach', 'phish', 'whois', 'dnsrecon', 'ipinfo', 'hash', 'hashid', 'passanalyze', 'gpass'] },
  { key: 'general', icon: '✨', title: 'GENERAL & INFO', poem: 'know the star you orbit', cmds: ['menu', 'help', 'bot', 'alive', 'ping', 'uptime', 'runtime', 'stats', 'user', 'owner', 'CELESTIA', 'donate', 'script', 'wolftech', 'settings', 'time', 'jid', 'gjid', 'cinfo', 'status', 'setstatus'] },
  { key: 'ai', icon: '🧠', title: 'AI HEAVENS', poem: 'minds made of starlight', cmds: ['ai', 'claude', 'void', 'wormgpt', 'bibleai', 'muslimai', 'imagine', 'vision', 'vision2', 'speechwriter'] },
  { key: 'downloader', icon: '⬇️', title: 'DOWNLOADERS', poem: 'catch what falls from the sky', cmds: ['tiktok', 'ig', 'fb', 'twitter', 'igstory', 'pindl', 'song', 'play', 'play2', 'audio', 'download', 'video', 'video2', 'spotify', 'apk', 'gitclone'] },
  { key: 'media', icon: '🎬', title: 'MEDIA STUDIO', poem: 'the forge of moving light', cmds: ['sticker', 'take', 'attp', 'mix', 'photo', 'toimg', 'tovideo', 'toaudio', 'cut', 'merge', 'tts', 'totext', 'transcribe', 'shazam', 'vocalremover', 'move', 'caption', 'doc', 'react', 'del'] },
  { key: 'image', icon: '🖼️', title: 'IMAGE LAB', poem: 'paint with pure voltage', cmds: ['remini', 'removebg', 'imagesearch', 'similarimage', 'ocr', 'qr', 'carbon', 'screenshot', 'webscan', 'fancy'] },
  { key: 'docs', icon: '📄', title: 'DOCUMENT FORGE', poem: 'stone tablets for the digital age', cmds: ['topdf', 'toword', 'toexcel', 'vcf', 'zip'] },
  { key: 'group', icon: '👥', title: 'GROUP ADMIN', poem: 'order in the pack', cmds: ['open', 'close', 'mute', 'unmute', 'amute', 'aunmute', 'promote', 'demote', 'kick', 'add', 'join', 'approve', 'reject', 'warn', 'hidetag', 'tagall', 'tag', 'poll', 'link', 'revoke', 'subject', 'desc', 'icon', 'groupinfo', 'groupstatus', 'gstatus', 'admin', 'invite', 'gpp'] },
  { key: 'security', icon: '🛡️', title: 'GROUP SECURITY', poem: 'walls without mercy for chaos', cmds: ['antibot', 'antilink', 'antilinkall', 'antidelete', 'antiedit', 'antitag', 'antigm', 'antigstatus', 'antispam', 'antiword', 'badword', 'welcomegoodbye', 'welcome', 'goodbye', 'setgreet', 'pdm', 'foreigners'] },
  { key: 'owner', icon: '👑', title: 'OWNER CROWN', poem: 'the hand that holds the leash', cmds: ['mode', 'public', 'self', 'prefix', 'getprefix', 'menutype', 'botpp', 'fullpp', 'broadcast', 'block', 'unblock', 'blocklist', 'ban', 'unban', 'mygroups', 'leavegroup', 'restart', 'logout', 'update', 'updatenow', 'pair', 'pair2', 'oadmin', 'left'] },
  { key: 'sudo', icon: '🎖️', title: 'SUDO & ACCESS', poem: 'trust, but verified', cmds: ['addsudo', 'delsudo', 'checksudo', 'clearsudos', 'zushi'] },
  { key: 'nuke', icon: '💀', title: 'WEAPONS OF MASS DESTRUCTION', poem: 'speak softly; carry a nuke', cmds: ['spam', 'kill', 'kill2', 'clear'] },
  { key: 'auto', icon: '🤖', title: 'AUTOMATION', poem: 'she moves while you sleep', cmds: ['autoread', 'autoview', 'autolike', 'autotyping', 'autorecording', 'autobio', 'anticall', 'wapresence', 'vv', 'vv2', 'save', 'save1'] },
  { key: 'games', icon: '🎮', title: 'ARCADE & FUN', poem: 'play among the planets', cmds: ['game', 'answer', 'rps', 'tictactoe', 'wordguess', 'guess', 'wgend', 'mathquiz', 'mans', 'joke', 'quote', 'zodiac', 'common', 'ttend'] },
  { key: 'football', icon: '⚽', title: 'FOOTBALL ZONE', poem: 'twenty-two hearts, one law', cmds: ['epl', 'eplscorers', 'laliga', 'laligascorers', 'seriea', 'serieascorers', 'bundesliga', 'bundesligascorers', 'ligue1', 'ligue1scorers', 'ucl', 'uclscorers', 'euro', 'fifa', 'fifaplayoffs', 'news', 'livescore', 'standings', 'playersearch', 'teamsearch'] },
  { key: 'utility', icon: '🧰', title: 'UTILITY BELT', poem: 'everything else worth carrying', cmds: ['calc', 'define', 'base', 'unbase', 'trt', 'lyrics', 'lyrics2', 'ison', 'getpfp', 'upload', 'url', 'clearcache', 'eval', 'shell', 'fetch', 'cat', 'getfile', 'getcmd', 'enc', 'compile-py', 'compile-js', 'compile-c', 'compile-c++', 'disp-1', 'disp-7', 'disp-90', 'disp-off'] },
];

// ═══════════════════════════════════════════════════
// THEME 1: CONSTELLATION — star-map, figlet, poems
// ═══════════════════════════════════════════════════
const T1 = {
  key: 'constellation', name: 'STAR MAP', icon: '🗺️',
  figlet() {
    try {
      return figlet.textSync('CELESTIA', { font: 'Small' })
        .split('\n').map(l => l.replace(/\s+$/g, '')).filter(l => l).join('\n');
    } catch { return '✨ C E L E S T I A ✨'; }
  },
  index(prefix, commands, total) {
    const L = [];
    L.push('```' + this.figlet() + '```');
    L.push('*THE  MOST  BEAUTIFUL  BOT*');
    L.push('🐺 _WolfTech howled → ✨ Celestia ascended_');
    L.push('');
    L.push(`╭─────────────────────────╮`);
    L.push(`│  🗺️  *THE CONSTELLATION*  │`);
    L.push(`│  ${String(total).padStart(3)} commands • ${CATEGORIES.length} realms │`);
    L.push(`│  prefix: *${prefix}*            │`);
    L.push(`╰─────────────────────────╯`);
    L.push('');
    for (const c of CATEGORIES) {
      const n = c.cmds.filter(x => commands.has(x)).length;
      L.push(`${c.icon} \`${prefix}menu ${c.key}\` — ${c.title} *(${n})*`);
    }
    L.push('');
    L.push(`📜 \`${prefix}menu all 1\` — full atlas`);
    L.push('> _Howl of the Wolf → Light of the Stars_');
    return L.join('\n');
  },
  realm(cat, prefix, commands, page) {
    const PER = 14;
    const avail = cat.cmds.filter(n => commands.has(n));
    const pages = Math.ceil(avail.length / PER) || 1;
    const p = Math.max(1, Math.min(page, pages));
    const slice = avail.slice((p - 1) * PER, p * PER);
    const L = [];
    L.push(`\`${cat.icon}  ${cat.title}\``);
    L.push(`_❝ ${cat.poem} ❞_`);
    L.push('');
    for (const name of slice) {
      const cmd = commands.get(name);
      const d = (cmd.description || '').split('.')[0].slice(0, 58);
      const a = (cmd.aliases?.length) ? `ᴬ${cmd.aliases.length}` : '';
      L.push(`✧ \`${prefix}${name}\`${a} — _${d}_`);
    }
    if (pages > 1) L.push('', `📜 ${p}/${pages} — \`${prefix}menu ${cat.key} ${p % pages + 1}\` for next`);
    L.push('', '```        · · ✦ · ·        ```');
    return L.join('\n');
  },
  footer: '> _Howl of the Wolf → Light of the Stars_',
};

// ═══════════════════════════════════════════════════
// THEME 2: NEON CLASSIC — box-drawn cyber panels
// ═══════════════════════════════════════════════════
const T2 = {
  key: 'neon', name: 'NEON CLASSIC', icon: '🌆',
  index(prefix, commands, total) {
    const L = [];
    L.push('```╔════════════════════════════╗');
    L.push('║  ✨  C E L E S T I A  ✨   ║');
    L.push('║   THE MOST BEAUTIFUL BOT   ║');
    L.push('╚════════════════════════════╝```');
    L.push('🐺⚡ _WolfTech × Celestia — Powered Lineage_');
    L.push('');
    L.push(`┏━━━ 🌆 *NEON GRID* ━━━┓`);
    L.push(`┃ ⚡ ${total} commands • ${CATEGORIES.length} zones`);
    L.push(`┃ ⌨️ prefix: *${prefix}*`);
    L.push('┗━━━━━━━━━━━━━━━━━━━━━━━┛');
    L.push('');
    for (const c of CATEGORIES) {
      const n = c.cmds.filter(x => commands.has(x)).length;
      L.push(`┣ ${c.icon} *${c.title}* — \`${prefix}menu ${c.key}\` _(${n})_`);
    }
    L.push('');
    L.push(`┗ 📜 \`${prefix}menu all 1\` — the full grid`);
    L.push('> ⚡ _Neon veins. Wolf instincts._');
    return L.join('\n');
  },
  realm(cat, prefix, commands, page) {
    const PER = 14;
    const avail = cat.cmds.filter(n => commands.has(n));
    const pages = Math.ceil(avail.length / PER) || 1;
    const p = Math.max(1, Math.min(page, pages));
    const slice = avail.slice((p - 1) * PER, p * PER);
    const L = [];
    L.push(`┏━━━ ${cat.icon} *${cat.title}* ━━━┓`);
    L.push(`┃ ⚡ ${cat.poem}`);
    L.push('┃');
    for (const name of slice) {
      const cmd = commands.get(name);
      const d = (cmd.description || '').split('.')[0].slice(0, 45);
      L.push(`┣ ⚡ \`${prefix}${name}\` — ${d}`);
    }
    L.push('┗' + '━'.repeat(27));
    if (pages > 1) L.push(`📄 ${p}/${pages} — \`${prefix}menu ${cat.key} ${p % pages + 1}\` next`);
    return L.join('\n');
  },
  footer: '> ⚡ _Neon veins. Wolf instincts._',
};

// ═══════════════════════════════════════════════════
// THEME 3: MINIMAL ZEN — clean, whitespace, quiet
// ═══════════════════════════════════════════════════
const T3 = {
  key: 'zen', name: 'MINIMAL ZEN', icon: '🍃',
  index(prefix, commands, total) {
    const L = [];
    L.push('✨ *CELESTIA*');
    L.push(`_${total} commands · ${CATEGORIES.length} realms · prefix ${prefix}_`);
    L.push('');
    for (const c of CATEGORIES) {
      L.push(`${c.icon} ${c.title.toLowerCase()} → \`${prefix}menu ${c.key}\``);
    }
    L.push('');
    L.push(`everything → \`${prefix}menu all 1\``);
    L.push('— 🐺 ✨');
    return L.join('\n');
  },
  realm(cat, prefix, commands, page) {
    const PER = 16;
    const avail = cat.cmds.filter(n => commands.has(n));
    const pages = Math.ceil(avail.length / PER) || 1;
    const p = Math.max(1, Math.min(page, pages));
    const slice = avail.slice((p - 1) * PER, p * PER);
    const L = [];
    L.push(`${cat.icon} *${cat.title.toLowerCase()}*`);
    L.push(`_${cat.poem}_`);
    L.push('');
    L.push(slice.map(n => `\`${prefix}${n}\``).join(' · '));
    if (pages > 1) L.push('', `_${p}/${pages} · more: ${prefix}menu ${cat.key} ${p % pages + 1}_`);
    L.push('', '—');
    return L.join('\n');
  },
  footer: '— 🐺 ✨',
};

// ═══════════════════════════════════════════════════
// THEME 4: ARCANE GRIMOIRE — spellbook of the wolf
// ═══════════════════════════════════════════════════
const T4 = {
  key: 'grimoire', name: 'ARCANE GRIMOIRE', icon: '📜',
  index(prefix, commands, total) {
    const L = [];
    L.push('```◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬◬');
    L.push('   ✦ T H E   G R I M O I R E ✦');
    L.push('      of the Celestial Wolf');
    L.push('◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬ ◬◬```');
    L.push('_Forged in the Wolf\'s Den • Bound in Starlight_');
    L.push('');
    L.push(`*Table of Contents* — ${total} incantations:`);
    L.push('');
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII'];
    CATEGORIES.forEach((c, i) => {
      const n = c.cmds.filter(x => commands.has(x)).length;
      L.push(`${roman[i] || '•'}. ${c.icon} *${c.title}* — _${cat2Spell(c)}_ (${n})`);
      L.push(`     ↳ \`${prefix}menu ${c.key}\``);
    });
    L.push('');
    L.push(`*Appendix:* \`${prefix}menu all 1\` — the full tome`);
    L.push('');
    L.push('```· · ──── ✦ ──── · ·```');
    L.push('> 🐺 _By fang and starlight, so it is written._');
    return L.join('\n');
  },
  realm(cat, prefix, commands, page) {
    const PER = 13;
    const avail = cat.cmds.filter(n => commands.has(n));
    const pages = Math.ceil(avail.length / PER) || 1;
    const p = Math.max(1, Math.min(page, pages));
    const slice = avail.slice((p - 1) * PER, p * PER);
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII'];
    const rIdx = CATEGORIES.indexOf(cat);
    const L = [];
    L.push('```◭ ───────────────── ⧫ ───────────────── ◮```');
    L.push(`${cat.icon} *CHAPTER ${roman[rIdx] || '•'} — ${cat.title}*`);
    L.push(`_"${cat2Spell(cat)}"_`);
    L.push('```◭ ───────────────── ⧫ ───────────────── ◮```');
    L.push('');
    slice.forEach((name, i) => {
      const cmd = commands.get(name);
      const d = (cmd.description || '').split('.')[0].slice(0, 42);
      const glyph = ['✦', '❖', '◆', '✧', '⟡'][i % 5];
      L.push(`${glyph} *${name}* — _${d}_`);
    });
    if (pages > 1) L.push('', `_— page ${p}/${pages} · turn: ${prefix}menu ${cat.key} ${p % pages + 1} —_`);
    L.push('', '```· · ──── ✦ ──── · ·```');
    return L.join('\n');
  },
  footer: '> 🐺 _By fang and starlight._',
};

function cat2Spell(cat) {
  return cat.poem;
}

const THEMES = { constellation: T1, neon: T2, zen: T3, grimoire: T4 };
const THEME_ORDER = [
  { key: 'constellation', icon: '🗺️', name: 'STAR MAP' },
  { key: 'neon', icon: '🌆', name: 'NEON CLASSIC' },
  { key: 'zen', icon: '🍃', name: 'MINIMAL ZEN' },
  { key: 'grimoire', icon: '📜', name: 'ARCANE GRIMOIRE' },
];

function getTheme() {
  const t = settingsStore.get('menu_theme', 'constellation');
  return THEMES[t] || T1;
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════
module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'list'],
  description: '✨ The Menu of Four Faces — Constellation, Neon, Zen, Grimoire',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', config.prefix) || '.';
    const arg0 = (args[0] || '').toLowerCase();

    // count unique
    const unique = new Set();
    for (const c of commands.values()) unique.add(c.name);
    const total = unique.size;

    const theme = getTheme();

    const send = async (text) => {
      if (text.length > 3800) {
        const mid = text.lastIndexOf('\n', 2200);
        await send(text.slice(0, mid).trim());
        await send(text.slice(mid).trim());
        return;
      }
      if (fs.existsSync(LOGO_PATH)) {
        try {
          await sock.sendMessage(jid, { image: fs.readFileSync(LOGO_PATH), caption: text }, { quoted: msg });
          return;
        } catch { /* fall */ }
      }
      await sock.sendMessage(jid, { text }, { quoted: msg });
    };

    // ─── .menu theme — show theme picker (native list) ───
    if (arg0 === 'theme' || arg0 === 'style' || arg0 === 'appearance') {
      try {
        await sock.sendMessage(jid, {
          text: `🎨 *Choose her face* — current: *${theme.name}* ${theme.icon}`,
          buttonText: '🎨 Pick a Face',
          sections: [{
            title: '✨ Menu Appearances',
            rows: THEME_ORDER.map(t => ({
              title: `${t.icon} ${t.name}`,
              rowId: `${prefix}menutheme ${t.key}`,
              description: {
                constellation: 'star-map · figlet banner · realm poems',
                neon: 'cyber grid · box panels · sharp lines',
                zen: 'quiet whitespace · command clouds',
                grimoire: 'ancient spellbook · roman chapters',
              }[t.key],
            })),
          }],
        }, { quoted: msg });
        return;
      } catch {
        // fallback text picker
        const cur = settingsStore.get('menu_theme', 'constellation');
        const lines = THEME_ORDER.map(t => `${t.icon} \`${prefix}menutheme ${t.key}\`${t.key === cur ? ' ← current' : ''}`).join('\n');
        return reply(`🎨 *Menu appearances:*\n\n${lines}\n\nOr \`.menutheme native\` for WhatsApp tappable menus.`);
      }
    }

    // ─── .menu all [page] — atlas in current theme ───
    if (arg0 === 'all') {
      const PER = 3;
      const totalPages = Math.ceil(CATEGORIES.length / PER);
      const p = Math.max(1, Math.min(parseInt(args[1], 10) || 1, totalPages));
      const cats = CATEGORIES.slice((p - 1) * PER, p * PER);
      const L = [`\`\`\`📖  ATLAS  ${p}/${totalPages}\`\`\``];
      for (const cat of cats) L.push(theme.realm(cat, prefix, commands, 1));
      L.push(`\`\`\`— ${prefix}menu all ${p % totalPages + 1} →—\`\`\``);
      return send(L.join('\n'));
    }

    // ─── .menu <realm> [page] ───
    if (arg0) {
      const cat = CATEGORIES.find(c => c.key === arg0);
      if (cat) {
        const r = theme.realm(cat, prefix, commands, parseInt(args[1], 10) || 1);
        return send(r + '\n\n' + theme.footer);
      }
      const valid = CATEGORIES.map(c => c.key).join(' • ');
      return reply(`🧭 Unknown realm *${arg0}*.\nRealms: ${valid}\nOr \`${prefix}menu theme\` to change her face.`);
    }

    // ─── native mode: bare .menu = tappable realms ───
    if (settingsStore.get('menu_native', false)) {
      try {
        await sock.sendMessage(jid, {
          text: `${theme.icon} *${theme.name}* — ${total} commands, ${CATEGORIES.length} realms\nChoose a realm, ${msg.pushName || 'traveler'}:`,
          buttonText: '🚀 Enter',
          sections: [{
            title: `${theme.icon} ${theme.name}`,
            rows: CATEGORIES.filter(c => c.cmds.some(n => commands.has(n))).map(c => ({
              title: `${c.icon} ${c.title}`,
              rowId: `${prefix}menu ${c.key}`,
              description: c.poem,
            })),
          }],
        }, { quoted: msg });
        return;
      } catch { /* fall to render */ }
    }

    // ─── bare .menu — themed index ───
    const idx = theme.index(prefix, commands, total);
    return send(idx);
  },
};
