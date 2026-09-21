const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const settingsStore = require('../utils/settingsStore');
const { RULE, shortUptime } = require('../utils/celestiaUi');

const LOGO_PATH = path.join(__dirname, '../assets/banner.png');
const PAGE_SIZE = 9;

const CATEGORIES = [
  { key: 'heart', icon: '💫', title: 'HER HEART', poem: 'the soul that stays', cmds: ['celestia', 'recall', 'goodnight', 'goodmorning', 'wish', 'watchover', 'remind', 'capsule', 'habit'] },
  { key: 'intel', icon: '🌦️', title: 'DAY INTEL', poem: 'the pulse of your world, hourly', cmds: ['weather', 'wx', 'forecast', 'pray', 'salah', 'crypto', 'coins', 'fx', 'rate', 'briefing', 'herald', 'daily', 'roast', 'burn', 'wolffire'] },
  { key: 'mystic', icon: '🔮', title: 'MYSTIC', poem: 'the cards, the stars, the numbers', cmds: ['tarot', 'cards', 'pull', 'horoscope', 'zodiacread', 'stars', 'numerology', 'numbers', 'fortune', 'cookie', 'omen', 'zodiac'] },
  { key: 'space', icon: '🚀', title: 'SPACE', poem: 'the sky is not the limit', cmds: ['apod', 'spacepic', 'astropic', 'mars', 'iss', 'station'] },
  { key: 'wellness', icon: '🧘', title: 'WELLNESS', poem: 'she guards the vessel', cmds: ['wellness', 'health', 'fit'] },
  { key: 'business', icon: '💼', title: 'BUSINESS HUB', poem: 'the honest ledger', cmds: ['invoice', 'inv', 'expense', 'expenses', 'spend'] },
  { key: 'travel', icon: '✈️', title: 'TRAVEL KIT', poem: 'go far, pack light', cmds: ['travel', 'trip', 'packing'] },
  { key: 'game', icon: '🏆', title: 'THE GAME', poem: 'the legend you live inside', cmds: ['level', 'rank', 'xp', 'legend', 'pet', 'wolf', 'companion', 'daily', 'claim', 'dailybonus', 'quests', 'quest', 'dailies', 'loot', 'crate', 'box', 'casino', 'bet', 'slots', 'secrets', 'eastereggs', 'mystery'] },
  { key: 'status', icon: '📱', title: 'STATUS & VAULT', poem: 'beyond the normal, quietly', cmds: ['statussuite', 'ssuite', 'studio', 'setstatus', 'poststatus', 'status', 'statusview', 'whoviewed', 'statusreact', 'sreact', 'ghostarchive', 'garchive', 'statusarchive', 'vault', 'vvault', 'captures', 'vv', 'vv2', 'ghost', 'anon', 'anonymous'] },
  { key: 'atlas', icon: '🌍', title: 'WORLD ATLAS', poem: 'the world, mapped and alive', cmds: ['locate', 'where', 'geo', 'place', 'maps', 'senderlocate', 'slocate', 'whereis', 'locateuser', 'webcam', 'cam', 'worldcam', 'livecam', 'satellite', 'sat', 'satspy', 'orbital', 'ipinfo', 'geoip', 'ip', 'dnsrecon', 'whois'] },
  { key: 'portal', icon: '🌀', title: 'THE PORTAL', poem: 'free corners of the web, alive', cmds: ['portal', 'sites', 'webportal', 'goodies'] },
  { key: 'cyber', icon: '⚔️', title: 'CYBER FORTRESS', poem: 'the wolf guards the den', cmds: ['cyberfort', 'kev', 'cve', 'breach', 'phish', 'whois', 'dnsrecon', 'ipinfo', 'hash', 'hashid', 'passanalyze', 'gpass'] },
  { key: 'general', icon: '✨', title: 'GENERAL & INFO', poem: 'know the star you orbit', cmds: ['menu', 'help', 'bot', 'alive', 'ping', 'uptime', 'runtime', 'stats', 'user', 'owner', 'celestia', 'donate', 'script', 'wolftech', 'settings', 'time', 'jid', 'gjid', 'cinfo', 'status', 'setstatus'] },
  { key: 'ai', icon: '🧠', title: 'AI HEAVENS', poem: 'minds made of starlight', cmds: ['ai', 'claude', 'void', 'wormgpt', 'bibleai', 'muslimai', 'imagine', 'vision', 'vision2', 'speechwriter', 'autochat'] },
  { key: 'downloader', icon: '⬇️', title: 'DOWNLOADERS', poem: 'catch what falls from the sky', cmds: ['tiktok', 'ig', 'fb', 'twitter', 'igstory', 'pindl', 'song', 'play', 'play2', 'audio', 'download', 'downloader', 'video', 'video2', 'spotify', 'apk', 'gitclone', 'music', 'socialdl'] },
  { key: 'media', icon: '🎬', title: 'MEDIA STUDIO', poem: 'the forge of moving light', cmds: ['sticker', 's', 'smeme', 'take', 'attp', 'mix', 'photo', 'toimg', 'tovideo', 'toaudio', 'cut', 'merge', 'tts', 'totext', 'transcribe', 'shazam', 'vocalremover', 'move', 'caption', 'doc', 'react', 'del'] },
  { key: 'image', icon: '🖼️', title: 'IMAGE LAB', poem: 'paint with pure voltage', cmds: ['remini', 'removebg', 'imagesearch', 'similarimage', 'ocr', 'qr', 'carbon', 'screenshot', 'webscan', 'fancy'] },
  { key: 'docs', icon: '📄', title: 'DOCUMENT FORGE', poem: 'stone tablets for the digital age', cmds: ['topdf', 'toword', 'toexcel', 'vcf', 'zip'] },
  { key: 'group', icon: '👥', title: 'GROUP ADMIN', poem: 'order in the pack', cmds: ['open', 'close', 'mute', 'unmute', 'amute', 'aunmute', 'promote', 'demote', 'kick', 'add', 'join', 'approve', 'reject', 'warn', 'delete', 'hidetag', 'tagall', 'tag', 'poll', 'link', 'revoke', 'subject', 'desc', 'icon', 'groupinfo', 'groupstatus', 'gstatus', 'admin', 'invite', 'gpp'] },
  { key: 'security', icon: '🛡️', title: 'GROUP SECURITY', poem: 'walls without mercy for chaos', cmds: ['antibot', 'antilink', 'antilinkall', 'antidelete', 'antiedit', 'antitag', 'antigm', 'antigstatus', 'antispam', 'antiword', 'badword', 'welcomegoodbye', 'welcome', 'goodbye', 'setgreet', 'pdm', 'foreigners'] },
  { key: 'owner', icon: '👑', title: 'OWNER CROWN', poem: 'the hand that holds the light', cmds: ['mode', 'public', 'self', 'prefix', 'getprefix', 'menutype', 'menutheme', 'botpp', 'fullpp', 'broadcast', 'block', 'unblock', 'blocklist', 'ban', 'unban', 'mygroups', 'leavegroup', 'restart', 'logout', 'update', 'updatenow', 'pair', 'pair2', 'oadmin', 'left'] },
  { key: 'sudo', icon: '🎖️', title: 'SUDO & ACCESS', poem: 'trust, but verified', cmds: ['addsudo', 'delsudo', 'checksudo', 'clearsudos', 'zushi'] },
  { key: 'nuke', icon: '💀', title: 'DESTRUCTIVE TOOLS', poem: 'power reserved for the crown', cmds: ['spam', 'kill', 'kill2', 'clear'] },
  { key: 'auto', icon: '🤖', title: 'AUTOMATION', poem: 'she moves while you sleep', cmds: ['autoread', 'autoview', 'autolike', 'autotyping', 'autorecording', 'autobio', 'anticall', 'wapresence', 'vv', 'vv2', 'save', 'save1'] },
  { key: 'games', icon: '🎮', title: 'ARCADE & FUN', poem: 'play among the planets', cmds: ['game', 'answer', 'rps', 'tictactoe', 'wordguess', 'guess', 'wgend', 'mathquiz', 'mans', 'joke', 'quote', 'zodiac', 'common', 'ttend'] },
  { key: 'football', icon: '⚽', title: 'FOOTBALL ZONE', poem: 'twenty-two hearts, one law', cmds: ['epl', 'eplscorers', 'laliga', 'laligascorers', 'seriea', 'serieascorers', 'bundesliga', 'bundesligascorers', 'ligue1', 'ligue1scorers', 'ucl', 'uclscorers', 'euro', 'fifa', 'fifaplayoffs', 'news', 'livescore', 'standings', 'playersearch', 'teamsearch'] },
  { key: 'utility', icon: '🧰', title: 'UTILITY BELT', poem: 'everything else worth carrying', cmds: ['calc', 'define', 'wiki', 'search', 'ytsearch', 'base', 'unbase', 'trt', 'lyrics', 'lyrics2', 'ison', 'getpfp', 'upload', 'url', 'clearcache', 'eval', 'shell', 'fetch', 'cat', 'getfile', 'getcmd', 'enc', 'compile-py', 'compile-js', 'compile-c', 'compile-c++', 'disp-1', 'disp-7', 'disp-90', 'disp-off'] },
];

const HOUSES = [
  { key: 'orbit', number: '01', icon: '☀️', title: 'INNER ORBIT', subtitle: 'Life, spirit & daily intelligence', cats: ['heart', 'intel', 'mystic', 'space', 'wellness', 'business', 'travel'] },
  { key: 'arena', number: '02', icon: '🏟️', title: 'THE ARENA', subtitle: 'Games, glory & live competition', cats: ['game', 'games', 'football'] },
  { key: 'forge', number: '03', icon: '✦', title: 'CREATOR FORGE', subtitle: 'AI, media & transformation', cats: ['ai', 'downloader', 'media', 'image', 'docs'] },
  { key: 'nexus', number: '04', icon: '🌐', title: 'WORLD NEXUS', subtitle: 'Information, places & connection', cats: ['status', 'atlas', 'portal', 'general', 'utility'] },
  { key: 'crown', number: '05', icon: '♛', title: 'CROWN CONTROL', subtitle: 'Administration, access & defense', cats: ['cyber', 'group', 'security', 'auto', 'sudo', 'owner', 'nuke'] },
];

const SKINS = {
  boxed: { glyph: '✦', name: 'SIGNATURE' },
  celestial: { glyph: '✧', name: 'CELESTIAL' },
  constellation: { glyph: '⋆', name: 'STAR MAP' },
  neon: { glyph: '◆', name: 'NEON' },
  zen: { glyph: '•', name: 'ZEN' },
  grimoire: { glyph: '❖', name: 'GRIMOIRE' },
};

function skin() {
  return SKINS[settingsStore.get('menu_theme', 'boxed')] || SKINS.boxed;
}

function clean(text, fallback = '') {
  return String(text || fallback).replace(/[\r\n*_`~]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function description(command) {
  const text = clean(command?.description, 'No description available.');
  return text.length > 68 ? `${text.slice(0, 65).trim()}...` : text;
}

function uniqueCommands(commands) {
  const byName = new Map();
  for (const command of commands.values()) {
    const name = clean(command?.name).toLowerCase();
    if (name && !byName.has(name)) byName.set(name, command);
  }
  return byName;
}

function buildCatalog(commands) {
  const unique = uniqueCommands(commands);
  const claimed = new Set();
  const categories = CATEGORIES.map((category) => {
    const list = [];
    for (const token of category.cmds) {
      const command = commands.get(String(token).toLowerCase());
      const name = clean(command?.name).toLowerCase();
      if (!name || claimed.has(name)) continue;
      claimed.add(name);
      list.push(command);
    }
    return { ...category, commands: list };
  });

  const utility = categories.find((category) => category.key === 'utility');
  for (const [name, command] of unique) {
    if (!claimed.has(name)) utility.commands.push(command);
  }
  return { categories, unique };
}

function houseFor(categoryKey) {
  return HOUSES.find((house) => house.cats.includes(categoryKey));
}

function categoryFor(catalog, key) {
  return catalog.categories.find((category) => category.key === String(key || '').toLowerCase());
}

function houseStats(house, catalog) {
  const categories = house.cats.map((key) => categoryFor(catalog, key)).filter((category) => category?.commands.length);
  return { categories, count: categories.reduce((sum, category) => sum + category.commands.length, 0) };
}

function masthead(title, breadcrumb, s = skin()) {
  const trail = clean(breadcrumb).replace(/\s*\/\s*/g, '  ›  ');
  return [
    `╭─ ${s.glyph} *CELESTIA / ${title}*`,
    `│ ${trail.toUpperCase()}`,
    `╰${RULE}`,
  ].join('\n');
}

function footer(lines) {
  return [
    '╭─ ◇ *NAVIGATION*',
    ...lines.map((line) => `│ ${line}`),
    `╰${RULE}`,
  ].join('\n');
}

function renderHome({ user, prefix, mode, total, catalog }) {
  const s = skin();
  const lines = [
    masthead('OBSERVATORY', 'home', s),
    '',
    `Welcome back, *${clean(user, 'Traveler').slice(0, 40)}*`,
    `_${s.name} interface · ${shortUptime(process.uptime())} uptime_`,
    '',
    '╭─ ◇ *FLIGHT STATUS*',
    `│ Command key  ›  ${prefix}`,
    `│ Access mode  ›  ${clean(mode, 'public').toUpperCase()}`,
    `│ Live signals ›  ${total}`,
    `│ Constellations › ${HOUSES.length}`,
    `╰${RULE}`,
    '',
    `        ${s.glyph}  *COMMAND CONSTELLATION*  ${s.glyph}`,
    '       _Choose where you want to go._',
  ];

  for (const house of HOUSES) {
    const stats = houseStats(house, catalog);
    if (!stats.count) continue;
    lines.push('', `╭─ ${house.number}  ${house.icon} *${house.title}*`);
    lines.push(`│ _${house.subtitle}_`);
    lines.push(`│ ${stats.categories.length} realms · ${stats.count} signals`);
    lines.push(`│ Enter › ${prefix}menu ${house.key}`);
    lines.push(`╰${RULE}`);
  }

  lines.push('', footer([
    `◇ ${prefix}menu all  · complete atlas`,
    `◇ ${prefix}menu find <word>  · signal search`,
    `◇ ${prefix}menu theme  · visual identity`,
  ]));
  lines.push('', `${s.glyph} _Howl of the Wolf · Light of the Stars_ ${s.glyph}`);
  return lines.join('\n');
}

function renderHouse(house, catalog, prefix) {
  const stats = houseStats(house, catalog);
  const lines = [
    masthead(house.title, `HOME  /  ${house.key}`),
    '',
    `${house.icon} *${house.subtitle}*`,
    `_${stats.count} live signals in ${stats.categories.length} realms_`,
  ];
  stats.categories.forEach((category, index) => {
    lines.push('', `╭─ ${String(index + 1).padStart(2, '0')}  ${category.icon} *${category.title}*`);
    lines.push(`│ _${category.poem}_`);
    lines.push(`│ ${category.commands.length} signals`);
    lines.push(`│ Open › ${prefix}menu ${house.key} ${category.key}`);
    lines.push(`╰${RULE}`);
  });
  lines.push('', footer([`← ${prefix}menu`, `◎ ${prefix}menu all`]));
  return lines.join('\n');
}

function renderRealm(category, house, prefix, page = 1) {
  const pages = Math.max(1, Math.ceil(category.commands.length / PAGE_SIZE));
  const current = Math.max(1, Math.min(Number(page) || 1, pages));
  const items = category.commands.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const lines = [
    masthead(category.title, `HOME  /  ${house.key}  /  ${category.key}`),
    '',
    `${category.icon} _${category.poem}_`,
    `*${category.commands.length} signals* · page ${current}/${pages}`,
    '',
  ];
  for (const command of items) {
    const name = clean(command.name).toLowerCase();
    lines.push(`${skin().glyph} *${prefix}${name}*`);
    lines.push(`   ${description(command)}`);
    lines.push('');
  }
  const nav = [`← ${prefix}menu ${house.key}`];
  if (current > 1) nav.push(`‹ ${prefix}menu ${house.key} ${category.key} ${current - 1}`);
  if (current < pages) nav.push(`› ${prefix}menu ${house.key} ${category.key} ${current + 1}`);
  nav.push(`Details › ${prefix}menu ${house.key} ${category.key} <command>`);
  lines.push(footer(nav));
  return lines.join('\n');
}

function renderDetail(category, house, command, prefix) {
  const name = clean(command.name).toLowerCase();
  const aliases = [...new Set((command.aliases || []).map((alias) => clean(alias).toLowerCase()).filter(Boolean))];
  const lines = [
    masthead('SIGNAL PROFILE', `HOME  /  ${house.key}  /  ${category.key}  /  ${name}`),
    '',
    `╭─ ${category.icon} *${prefix}${name}*`,
    `│ ${description(command)}`,
  ];
  if (aliases.length) {
    lines.push('│', '│ *Aliases*');
    for (const alias of aliases.slice(0, 8)) lines.push(`│  · ${prefix}${alias}`);
  }
  lines.push(`│`, `│ *Launch* › ${prefix}${name}`, `╰${RULE}`, '', footer([
    `← ${prefix}menu ${house.key} ${category.key}`,
    `⌂ ${prefix}menu`,
  ]));
  return lines.join('\n');
}

function renderAtlas(catalog, prefix, page = 1) {
  const available = catalog.categories.filter((category) => category.commands.length);
  const perPage = 7;
  const pages = Math.max(1, Math.ceil(available.length / perPage));
  const current = Math.max(1, Math.min(Number(page) || 1, pages));
  const slice = available.slice((current - 1) * perPage, current * perPage);
  const lines = [masthead('COMPLETE ATLAS', `HOME  /  ALL  /  ${current}`), '', `*${available.length} realms* · page ${current}/${pages}`];
  for (const category of slice) {
    const house = houseFor(category.key);
    lines.push('', `${category.icon} *${category.title}*`);
    lines.push(`   ${category.commands.length} signals · ${prefix}menu ${house.key} ${category.key}`);
  }
  const nav = [`← ${prefix}menu`];
  if (current > 1) nav.push(`‹ ${prefix}menu all ${current - 1}`);
  if (current < pages) nav.push(`› ${prefix}menu all ${current + 1}`);
  lines.push('', footer(nav));
  return lines.join('\n');
}

function renderSearch(catalog, prefix, query) {
  const q = clean(query).toLowerCase().slice(0, 50);
  const matches = [];
  for (const category of catalog.categories) {
    const house = houseFor(category.key);
    for (const command of category.commands) {
      const haystack = `${command.name} ${(command.aliases || []).join(' ')} ${command.description || ''}`.toLowerCase();
      if (q && haystack.includes(q)) matches.push({ command, category, house });
    }
  }
  const lines = [masthead('SIGNAL SEARCH', `HOME  /  FIND  /  ${q || '...'}`), ''];
  if (!q) {
    lines.push(`Search names, aliases or descriptions.`, '', `Try › ${prefix}menu find weather`);
  } else if (!matches.length) {
    lines.push(`No signal matched *${q}*.`, '', `_Try a shorter word or command alias._`);
  } else {
    lines.push(`*${matches.length} match${matches.length === 1 ? '' : 'es'}* for “${q}”`, '');
    for (const { command, category, house } of matches.slice(0, 15)) {
      lines.push(`${skin().glyph} *${prefix}${clean(command.name).toLowerCase()}* · ${category.title}`);
      lines.push(`   ${prefix}menu ${house.key} ${category.key} ${clean(command.name).toLowerCase()}`);
    }
    if (matches.length > 15) lines.push('', `_Showing the first 15 results._`);
  }
  lines.push('', footer([`← ${prefix}menu`, `◎ ${prefix}menu all`]));
  return lines.join('\n');
}

function splitMenuText(text, maxLength = 12000) {
  if (!text || text.length <= maxLength) return [text];
  let splitAt = text.lastIndexOf('\n', maxLength);
  if (splitAt <= 0) splitAt = maxLength;
  return [text.slice(0, splitAt).trim(), ...splitMenuText(text.slice(splitAt).trim(), maxLength)].filter(Boolean);
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'list'],
  description: 'Explore CELESTIA through constellations, realms and command profiles.',
  execute: async (sock, msg, args, commands, reply) => {
    const jid = msg.key.remoteJid;
    const prefix = settingsStore.get('prefix', config.prefix) || '.';
    const catalog = buildCatalog(commands);
    const total = catalog.unique.size;
    const first = clean(args[0]).toLowerCase();
    const second = clean(args[1]).toLowerCase();
    const third = clean(args[2]).toLowerCase();

    const getMenuImage = () => {
      const custom = settingsStore.get('menu_banner', null);
      if (custom) {
        try { return Buffer.from(custom, 'base64'); } catch { /* use default */ }
      }
      for (const file of [LOGO_PATH, path.join(__dirname, '../assets/script.jpg')]) {
        try { if (fs.existsSync(file)) return fs.readFileSync(file); } catch { /* try next */ }
      }
      return null;
    };

    let bannerSent = false;
    const sendBanner = async () => {
      if (bannerSent) return;
      const image = getMenuImage();
      if (image) {
        try {
          await sock.sendMessage(jid, { image }, { quoted: msg });
          bannerSent = true;
        } catch { /* text still sends */ }
      }
    };

    const send = async (text, withBanner = true) => {
      if (withBanner) {
        const image = getMenuImage();
        if (image) {
          await sock.sendMessage(jid, { image, caption: text }, { quoted: msg });
          return;
        }
      }
      for (const [index, chunk] of splitMenuText(text).entries()) {
        await sock.sendMessage(jid, { text: chunk }, index === 0 ? { quoted: msg } : {});
      }
    };

    const sendVoice = async () => {
      const enhanced = path.join(__dirname, '../assets/menu-voice-celestial.opus');
      const clean = path.join(__dirname, '../assets/menu-voice.opus');
      const voicePath = fs.existsSync(enhanced) ? enhanced : clean;
      try {
        if (fs.existsSync(voicePath)) await sock.sendMessage(jid, { audio: fs.readFileSync(voicePath), mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
      } catch { /* optional */ }
    };

    if (['theme', 'style', 'appearance'].includes(first)) {
      return commands.get('menutheme')?.execute(sock, msg, [], commands, reply);
    }

    if (first === 'find' || first === 'search') return send(renderSearch(catalog, prefix, args.slice(1).join(' ')));
    if (first === 'all') return send(renderAtlas(catalog, prefix, Number(second) || 1));

    const selectedHouse = HOUSES.find((house) => house.key === first);
    if (selectedHouse) {
      if (!second) {
        if (settingsStore.get('menu_native', false)) {
          const stats = houseStats(selectedHouse, catalog);
          try {
            await sendBanner();
            await sock.sendMessage(jid, {
              text: `${selectedHouse.icon} *${selectedHouse.title}*\n_${selectedHouse.subtitle}_`,
              buttonText: '✦ Choose a realm',
              sections: [{ title: selectedHouse.title, rows: stats.categories.map((category) => ({
                title: `${category.icon} ${category.title}`,
                rowId: `${prefix}menu ${selectedHouse.key} ${category.key}`,
                description: `${category.commands.length} signals · ${category.poem}`,
              })) }],
            }, { quoted: msg });
            return;
          } catch { /* use text layout */ }
        }
        return send(renderHouse(selectedHouse, catalog, prefix));
      }
      const category = categoryFor(catalog, second);
      if (!category || !selectedHouse.cats.includes(category.key)) return send(renderHouse(selectedHouse, catalog, prefix));
      if (third && !/^\d+$/.test(third)) {
        const command = category.commands.find((item) => clean(item.name).toLowerCase() === third || (item.aliases || []).some((alias) => clean(alias).toLowerCase() === third));
        if (command) return send(renderDetail(category, selectedHouse, command, prefix));
      }
      return send(renderRealm(category, selectedHouse, prefix, Number(third) || 1));
    }

    const directCategory = categoryFor(catalog, first);
    if (directCategory) {
      const house = houseFor(directCategory.key);
      if (second && !/^\d+$/.test(second)) {
        const command = directCategory.commands.find((item) => clean(item.name).toLowerCase() === second || (item.aliases || []).some((alias) => clean(alias).toLowerCase() === second));
        if (command) return send(renderDetail(directCategory, house, command, prefix));
      }
      return send(renderRealm(directCategory, house, prefix, Number(second) || 1));
    }

    if (first) return send(renderSearch(catalog, prefix, first));

    if (settingsStore.get('menu_native', false)) {
      try {
        await sendBanner();
        await sock.sendMessage(jid, {
          text: `${skin().glyph} *CELESTIA OBSERVATORY*\n${total} live signals · choose a constellation, ${clean(msg.pushName, 'Traveler')}.`,
          buttonText: '✦ Enter observatory',
          sections: [{ title: 'COMMAND CONSTELLATION', rows: HOUSES.map((house) => {
            const stats = houseStats(house, catalog);
            return { title: `${house.number} ${house.icon} ${house.title}`, rowId: `${prefix}menu ${house.key}`, description: `${stats.categories.length} realms · ${stats.count} signals` };
          }) }],
        }, { quoted: msg });
        return;
      } catch { /* use text layout */ }
    }

    await send(renderHome({
      user: msg.pushName || 'Traveler',
      prefix,
      mode: settingsStore.get('mode', config.WORK_TYPE),
      total,
      catalog,
    }));
    await sendVoice();
  },
  _internals: { buildCatalog, renderHome, renderHouse, renderRealm, renderDetail, renderAtlas, renderSearch, HOUSES, CATEGORIES },
};
