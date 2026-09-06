/**
 * 🌀 THE PORTAL — CELESTIA's living web atlas 🌀
 *
 * Not a hardcoded list. A living market:
 *   - SEED catalog: vetted "insanely good free" sites (the evergreen floor)
 *   - DEMAND: every user tap/query nudges a category & tag up (demand score)
 *   - SUPPLY: live fresh discoveries — GitHub Trending + Hacker News front page
 *     (the world's real-time "what's good right now" signal)
 *   - ROTATION: seeds get momentum-weighted shuffle; trending supplies rotate
 *     hourly. No two `.portal` answers look the same.
 *
 * Data lives in settingsStore → survives restarts.
 */

const axios = require('axios');
const crypto = require('crypto');
const settingsStore = require('./settingsStore');
const UA = 'CELESTIA-Portal/2.0';

// ─────────────────────────────────────────
// SEED CATALOG — vetted evergreen sites
// ─────────────────────────────────────────
const SEEDS = [
  // cat, name, url, why, tags
  ['learn', 'freeCodeCamp', 'https://freecodecamp.org', 'full dev curriculum + free certifications', ['course', 'code', 'cert']],
  ['learn', 'The Odin Project', 'https://theodinproject.com', 'full-stack path, project-driven', ['course', 'code']],
  ['learn', 'CS50', 'https://cs50.harvard.edu', "Harvard's intro CS — free, legendary lectures", ['course', 'cs', 'cert']],
  ['learn', 'Khan Academy', 'https://khanacademy.org', 'math, science, computing — all free', ['course', 'math']],
  ['learn', 'MIT OpenCourseWare', 'https://ocw.mit.edu', 'actual MIT courses, free materials', ['course', 'uni']],
  ['learn', 'Duolingo', 'https://duolingo.com', 'languages, gamified, free tier is the real product', ['language']],
  ['learn', 'ExcelIsFun (YouTube)', 'https://www.youtube.com/@excelisfun', 'the deepest free Excel masterclass on earth', ['excel', 'video']],

  ['tools', 'Photopea', 'https://photopea.com', 'Photoshop in your browser — free, no account', ['design', 'photo']],
  ['tools', 'remove.bg', 'https://remove.bg', 'background removal, instant', ['photo']],
  ['tools', 'iLovePDF', 'https://ilovepdf.com', 'every PDF tool that exists', ['pdf']],
  ['tools', 'Canva (free)', 'https://canva.com', 'design for non-designers', ['design']],
  ['tools', 'excalidraw', 'https://excalidraw.com', 'hand-drawn diagrams, zero setup', ['diagram', 'draw']],
  ['tools', 'tldraw', 'https://tldraw.com', 'infinite canvas whiteboard', ['draw', 'whiteboard']],
  ['tools', 'Wolfram Alpha', 'https://wolframalpha.com', 'computational knowledge engine', ['math', 'compute']],
  ['tools', '12ft Ladder', 'https://12ft.io', 'the "read the article" helper (ethics: your call)', ['read']],
  ['tools', 'screenshot.rocks', 'https://screenshot.rocks', 'beautiful browser-style screenshots', ['screenshot']],
  ['tools', 'SmallPDF', 'https://smallpdf.com', 'the other every-PDF-tool site', ['pdf']],

  ['dev', 'GitHub', 'https://github.com', 'the world\'s code, free forever', ['code', 'hosting']],
  ['dev', 'CodeSandbox', 'https://codesandbox.io', 'instant full dev environments in browser', ['ide', 'code']],
  ['dev', 'StackBlitz', 'https://stackblitz.com', 'same idea, faster, runs Node too', ['ide', 'code']],
  ['dev', 'Replit (free tier)', 'https://replit.com', 'code anything, anywhere, instantly', ['ide', 'code']],
  ['dev', 'regex101', 'https://regex101.com', 'regex with live explanation', ['regex', 'dev']],
  ['dev', 'DevDocs', 'https://devdocs.io', 'every API doc in one fast place', ['docs', 'dev']],
  ['dev', 'roadmap.sh', 'https://roadmap.sh', 'visual career roadmaps for developers', ['learn', 'career']],
  ['dev', 'JSON Crack', 'https://jsoncrack.com', 'visualize JSON as a graph', ['json', 'dev']],
  ['dev', 'Can I Use', 'https://caniuse.com', 'browser support tables', ['web', 'dev']],

  ['media', 'Internet Archive', 'https://archive.org', 'the library of the internet — books, films, software, everything', ['archive', 'books']],
  ['media', 'Project Gutenberg', 'https://gutenberg.org', '70k+ free ebooks, public domain', ['books']],
  ['media', 'OpenLibrary', 'https://openlibrary.org', 'borrow millions of books free', ['books', 'library']],
  ['media', 'LibriVox', 'https://librivox.org', 'free public-domain audiobooks', ['audio', 'books']],
  ['media', 'Pexels', 'https://pexels.com', 'free stock photos & videos', ['photo', 'stock']],
  ['media', 'Unsplash', 'https://unsplash.com', 'the other free photo giant', ['photo', 'stock']],
  ['media', 'Pixabay', 'https://pixabay.com', 'photos, vectors, videos, music', ['stock', 'audio']],
  ['media', 'Freesound', 'https://freesound.org', 'creative-commons sound effects', ['audio']],
  ['media', 'Musopen', 'https://musopen.org', 'free classical music & sheet music', ['music', 'classical']],
  ['media', 'Internet Archive - Software', 'https://archive.org/details/software', 'abandonware, vintage games, old OSes', ['games', 'retro']],

  ['security', 'Have I Been Pwned', 'https://haveibeenpwned.com', 'check your email against every breach', ['breach', 'privacy']],
  ['security', 'VirusTotal', 'https://virustotal.com', 'scan any file/URL with 70 engines', ['malware', 'scan']],
  ['security', 'Shields Up (CISA)', 'https://www.cisa.gov/shields-up', 'real government cyber guidance', ['gov', 'cyber']],
  ['security', 'CyberChef', 'https://gchq.github.io/CyberChef', 'GCHQ\'s cyber Swiss-army knife — 400+ ops in browser', ['tools', 'crypto']],
  ['security', 'Hybrid Analysis', 'https://hybrid-analysis.com', 'free malware sandbox', ['malware', 'sandbox']],
  ['security', 'URLScan.io', 'https://urlscan.io', 'scan any URL safely, see what it does', ['scan', 'phish']],
  ['security', 'PrivacyGuides', 'https://privacyguides.org', 'the trustworthy privacy toolkit', ['privacy']],

  ['ai', 'HuggingFace Spaces', 'https://huggingface.co/spaces', 'thousands of free live AI demos', ['ai', 'demo']],
  ['ai', 'Perplexity', 'https://perplexity.ai', 'AI search with sources (free)', ['ai', 'search']],
  ['ai', 'Google AI Studio', 'https://aistudio.google.com', 'free hands-on Gemini API playground', ['ai', 'gemini']],
  ['ai', 'Claude (free tier)', 'https://claude.ai', 'Anthropic\'s assistant, free tier', ['ai', 'chat']],
  ['ai', 'LM Arena', 'https://lmarena.ai', 'compare frontier AIs side-by-side, free', ['ai', 'compare']],
  ['ai', 'Suno', 'https://suno.com', 'AI music generation (free credits)', ['ai', 'music']],

  ['life', 'Notion (free)', 'https://notion.so', 'the everything workspace', ['notes', 'productivity']],
  ['life', 'flightradar24', 'https://flightradar24.com', 'every plane in the sky, live', ['flights', 'live']],
  ['life', 'Windy', 'https://windy.com', 'the most beautiful weather radar', ['weather']],
  ['life', 'Ventusky', 'https://ventusky.com', 'weather as art', ['weather']],
  ['life', 'insecam', 'https://insecam.org', 'the public-cam directory (what she uses for .webcam)', ['webcam', 'live']],
  ['life', 'Flightradar + ShipTracker', 'https://marine.com', 'boats like flightradar for ships', ['ships']],
  ['life', 'Numbeo', 'https://numbeo.com', 'cost of living, real crowdsourced data', ['data', 'travel']],
  ['life', 'Wikipedia random', 'https://en.wikipedia.org/wiki/Special:Random', 'the rabbit hole machine', ['wiki', 'fun']],
];

const CATEGORIES = [
  { key: 'learn', icon: '🎓', title: 'LEARN', poem: 'free ivy-league everything' },
  { key: 'tools', icon: '🧰', title: 'TOOLS', poem: 'the daily-driver toolbox' },
  { key: 'dev', icon: '⌨️', title: 'DEV', poem: 'build in the browser' },
  { key: 'media', icon: '🎬', title: 'MEDIA', poem: 'the free library of everything' },
  { key: 'security', icon: '🛡️', title: 'SECURITY', poem: 'the guardian kit' },
  { key: 'ai', icon: '🧠', title: 'AI', poem: 'frontier, free' },
  { key: 'life', icon: '✨', title: 'LIFE', poem: 'wonder-utility' },
];

// ─────────────────────────────────────────
// DEMAND ENGINE — momentum from usage
// ─────────────────────────────────────────

const DEMAND_KEY = 'portal_demand';   // { 'cat:tag': score, 'seed:name': score, '_cats': {cat: n} }
const SUPPLY_KEY = 'portal_supply';  // { github: [{..}], hn: [{..}], fetchedAt }

function getDemand() {
  const d = settingsStore.get(DEMAND_KEY, {});
  return d && typeof d === 'object' ? d : {};
}

function bumpDemand(keys) {
  const d = getDemand();
  const now = Date.now();
  for (const k of keys) {
    // exponential moving momentum: recent activity weighs more
    d[k] = ((d[k] || 0) * 0.98) + 1;
  }
  settingsStore.set(DEMAND_KEY, d);
}

function demandScore(key) {
  const d = getDemand();
  return d[key] || 0;
}

// ─────────────────────────────────────────
// SUPPLY ENGINE — live discovery
// ─────────────────────────────────────────

async function fetchGitHubTrending() {
  // Primary: unofficial trending mirror
  try {
    const res = await axios.get('https://gh-trending-api.herokuapp.com/repositories', {
      timeout: 12000, headers: { 'User-Agent': UA },
    });
    if (Array.isArray(res.data) && res.data.length) {
      return res.data.slice(0, 15).map(r => ({
        name: r.author && r.name ? `${r.author}/${r.name}` : (r.name || 'repo'),
        url: r.url || `https://github.com${r.url_path || ''}`,
        why: (r.description || 'trending on GitHub right now').slice(0, 90),
        stars: r.currentPeriodStars || r.stars || null,
        lang: r.language || null,
        source: 'github',
      }));
    }
  } catch { /* fall through */ }

  // Fallback: GitHub search API — most starred in the last 7 days (official, keyless)
  try {
    const week = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const res = await axios.get('https://api.github.com/search/repositories', {
      params: { q: `created:>${week}`, sort: 'stars', order: 'desc', per_page: 12 },
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      timeout: 12000,
    });
    return (res.data?.items || []).map(r => ({
      name: r.full_name,
      url: r.html_url,
      why: (r.description || 'new & fast-rising on GitHub').slice(0, 90),
      stars: r.stargazers_count,
      lang: r.language,
      source: 'github',
    }));
  } catch { return []; }
}

async function fetchHackerNews() {
  try {
    const ids = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json', {
      timeout: 10000, headers: { 'User-Agent': UA },
    });
    const top = (ids.data || []).slice(0, 12);
    const items = await Promise.all(top.map(id =>
      axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
        timeout: 8000, headers: { 'User-Agent': UA },
      }).then(r => r.data).catch(() => null)
    ));
    return items.filter(Boolean).map(i => ({
      name: (i.title || 'HN story').slice(0, 70),
      url: i.url || `https://news.ycombinator.com/item?id=${i.id}`,
      why: `#${i.score || '?'} points on Hacker News right now`,
      comments: i.descendants || null,
      source: 'hn',
    }));
  } catch { return []; }
}

async function refreshSupply(force = false) {
  const cached = settingsStore.get(SUPPLY_KEY, null);
  const ONE_HOUR = 60 * 60 * 1000;
  if (!force && cached && Date.now() - (cached.fetchedAt || 0) < ONE_HOUR) {
    return cached; // fresh enough
  }
  const [github, hn] = await Promise.all([fetchGitHubTrending(), fetchHackerNews()]);
  const supply = { github, hn, fetchedAt: Date.now() };
  settingsStore.set(SUPPLY_KEY, supply);
  return supply;
}

// ─────────────────────────────────────────
// ROTATION — weighted shuffle, never the same
// ─────────────────────────────────────────

function momentumShuffle(items, scoreFn) {
  // weighted sample without replacement
  const pool = items.map(it => ({ it, w: 1 + scoreFn(it) }));
  const out = [];
  while (pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = crypto.randomBytes(4).readUInt32BE(0) / 0xffffffff * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].w;
      if (r <= 0) break;
    }
    if (idx >= pool.length) idx = pool.length - 1;
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

// ─────────────────────────────────────────
// THE PORTAL — public API
// ─────────────────────────────────────────

function seedsFor(cat) {
  return SEEDS.filter(s => s[0] === cat).map(s => ({
    cat: s[0], name: s[1], url: s[2], why: s[3], tags: s[4], source: 'seed',
  }));
}

// .portal → cross-category picks weighted by demand
function rotatingPicks(count = 6) {
  const all = SEEDS.map(s => ({
    cat: s[0], name: s[1], url: s[2], why: s[3], tags: s[4], source: 'seed',
  }));
  const score = (it) => demandScore(`seed:${it.name}`) + demandScore(`cat:${it.cat}`);
  return momentumShuffle(all, score).slice(0, count);
}

// .portal <cat> → category picks weighted + rotated
function categoryPicks(cat, count = 6) {
  const catKey = cat.toLowerCase();
  const c = CATEGORIES.find(x => x.key === catKey);
  if (!c) return null;
  const seeds = seedsFor(catKey);
  const score = (it) => demandScore(`seed:${it.name}`);
  const picks = momentumShuffle(seeds, score).slice(0, count);
  return { cat: c, picks };
}

// .portal trending → live supply
async function trendingPicks() {
  const supply = await refreshSupply();
  const picks = [
    ...(supply.github || []).slice(0, 5),
    ...(supply.hn || []).slice(0, 5),
  ];
  return { supply, picks };
}

function bumpPick(pick) {
  const keys = [`seed:${pick.name}`];
  if (pick.cat) keys.push(`cat:${pick.cat}`);
  if (pick.source === 'github') keys.push('supply:github');
  if (pick.source === 'hn') keys.push('supply:hn');
  bumpDemand(keys);
}

function stats() {
  const d = getDemand();
  const entries = Object.entries(d)
    .filter(([k]) => !k.startsWith('_'))
    .sort((a, b) => b[1] - a[1]);
  return {
    seeds: SEEDS.length,
    categories: CATEGORIES.length,
    topDemanded: entries.slice(0, 8),
    supply: settingsStore.get(SUPPLY_KEY, null),
  };
}

module.exports = {
  CATEGORIES, SEEDS,
  rotatingPicks, categoryPicks, trendingPicks, bumpPick,
  refreshSupply, stats,
};
