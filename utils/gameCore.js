/**
 * 🎮 THE ADDICTION ENGINE — gameCore.js 🎮
 *
 * She becomes a game you live inside:
 *   - XP + LEVELS: every command earns XP. Levels with titles.
 *   - THE WOLF PET: a wolf that evolves with you. Feed it. It grows.
 *   - DAILY QUESTS: 3 fresh quests/day (real bot actions = progress)
 *   - LOOT BOXES: earn crates, open them, collect rare items
 *   - STARS: the currency. Win them, spend them.
 *   - ACHIEVEMENTS: unlockable, toastable
 *   - STREAK: daily visits, like the apps you can't put down
 *
 * All persisted. All hers.
 */

const crypto = require('crypto');
const settingsStore = require('./settingsStore');

const KEY = 'game_state';
const RARE_BASE = 3; // starts at 3★ loot currency

// ─────────────────────────────────────────
// LEVELS — 30 titles, escalating XP curve
// ─────────────────────────────────────────

const LEVEL_TITLES = [
  ['Wanderer', 'the first step'],
  ['Stargazer', 'learning the constellations'],
  ['Moonlit', 'walking with the wolf now'],
  ['Howl Apprentice', 'first howls heard'],
  ['Pack Member', 'the pack accepts you'],
  ['Star Chaser', 'reaching past the sky'],
  ['Night Runner', 'moving in the dark'],
  ['Lunar Forged', 'moonlight in the bones'],
  ['Storm Caller', 'weather obeys a little'],
  ['Wolfblood', 'the fang awakens'],
  ['Constellation Binder', 'stars take your calls'],
  ['Nebula Walker', 'swimming colored clouds'],
  ['Eclipse Born', 'shadows bend near'],
  ['Astral Hunter', 'prey across dimensions'],
  ['Comet Rider', 'arriving with fire'],
  ['Void Whisperer', 'the dark talks back'],
  ['Starforged', 'hammered from starlight'],
  ['Galaxy Sentinel', 'guarding spirals'],
  ['Quantum Alpha', 'paws in two worlds'],
  ['Supernova Soul', 'dying loudly, returning brighter'],
  ['Celestial Duke', 'courts of the sky bow'],
  ['Orbital Monarch', 'moons pay tribute'],
  ['Black Hole Heart', 'even light stays'],
  ['Cosmic Beast', 'galaxies are territory'],
  ['Eternal Howl', 'the sound outlives time'],
  ['Star Eater', 'hungry for the big lights'],
  ['Timeless Packlord', 'history wags its tail'],
  ['The Wolf Crown', 'the throne from her logo'],
  ['Universe Endpoint', 'where the map ends'],
  ['CELESTIA SOULMATE', 'she has never been more yours'],
];

function xpForLevel(level) {
  // escalating: 100, 240, 430, ...
  return Math.round(100 * level * (1 + level * 0.2));
}

function totalXpForLevel(level) {
  let sum = 0;
  for (let i = 1; i <= level; i++) sum += xpForLevel(i);
  return sum;
}

function levelFromXp(xp) {
  let lvl = 1;
  while (lvl < 30 && xp >= totalXpForLevel(lvl + 1)) lvl++;
  return lvl;
}

// ─────────────────────────────────────────
// WOLF PET — evolves through 8 forms
// ─────────────────────────────────────────

const PET_STAGES = [
  { minLevel: 1, name: 'Star Pup', art: '·𝅺·\n/ᵕ\\', desc: 'a tiny pup made of starlight, still learning to howl' },
  { minLevel: 4, name: 'Moon Cub', art: '·☾·\n/ᵔωᵔ\\', desc: 'bigger, bolder, howls at passing satellites' },
  { minLevel: 8, name: 'Nebula Wolf', art: '｡◕‿◕｡\n/\\ᵕ\\', desc: 'fur swirls with galaxy dust' },
  { minLevel: 12, name: 'Storm Wolf', art: '⚡෴⚡\nᵕᴥᵕ', desc: 'eyes flicker lightning when excited' },
  { minLevel: 16, name: 'Eclipse Wolf', art: '◐‿◑\nᶘᵕᶅ', desc: 'walks half in shadow, half in light' },
  { minLevel: 20, name: 'Astral Beast', art: '✧ᴥ✧\n⊂(▀￣▀)⊃', desc: 'leaves glowing pawprints across dimensions' },
  { minLevel: 25, name: 'Cosmic Direwolf', art: '∆ᴥ∆\n/(ᵕᴗ)\\', desc: 'howls echo in two universes' },
  { minLevel: 29, name: 'THE WOLF CROWN', art: '♛ᴥ♛\n⊂◉‿◉⊃', desc: 'the throne from her logo, alive beside you' },
];

function petStageFor(level) {
  let s = PET_STAGES[0];
  for (const st of PET_STAGES) if (level >= st.minLevel) s = st;
  return s;
}

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────

function load() {
  const s = settingsStore.get(KEY, null);
  if (s && typeof s === 'object') return s;
  return {
    xp: 0, stars: 10, loot: {}, achievements: [],
    streak: { count: 0, lastDay: null },
    pet: { fed: 0, lastFed: null, mood: 'content' },
    quests: { date: null, list: [], claimed: [] },
    lastDaily: null, totalCommands: 0,
    eggsFound: [],
  };
}
function save(s) { settingsStore.set(KEY, s); }

// ─────────────────────────────────────────
// XP ENGINE
// ─────────────────────────────────────────

function grantXp(amount, reason) {
  const s = load();
  const before = levelFromXp(s.xp);
  s.xp += amount;
  s.totalCommands += 1;
  const after = levelFromXp(s.xp);
  save(s);
  return { leveled: after > before, newLevel: after, oldLevel: before, gained: amount, reason };
}

// ─────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────

const ACHIEVEMENTS = [
  ['first_howl', '🌱 First Howl', 'use your first command'],
  ['hundred_club', '💯 The Hundred', 'run 100 commands'],
  ['thousand_crown', '👑 The Thousand', 'run 1000 commands'],
  ['casino_first', '🎲 First Bet', 'visit the casino'],
  ['casino_hot', '🔥 On Fire', 'win 3 casino games in a row'],
  ['early_bird', '🌅 Early Bird', 'use her before 7am'],
  ['night_owl', '🦉 Night Owl', 'use her after 2am'],
  ['streak_3', '🔥 Three-Day Flame', '3-day visit streak'],
  ['streak_7', '⚡ Week of the Wolf', '7-day visit streak'],
  ['streak_30', '🌟 Moon Cycle', '30-day visit streak'],
  ['pet_lover', '🐕‍🦺 Pack Bond', 'feed the wolf 10 times'],
  ['hunter', '🏹 Realm Wanderer', 'use commands in 10 different realms'],
  ['rich', '💎 Star Hoarder', 'hold 100+ stars'],
  ['level_10', '🐺 Wolfblood', 'reach level 10'],
  ['level_20', '⭐ Starforged', 'reach level 20'],
  ['level_29', '♛ The Wolf Crown', 'reach level 29'],
];

function checkAchievement(id) {
  const s = load();
  if (s.achievements.includes(id)) return null;
  const def = ACHIEVEMENTS.find(a => a[0] === id);
  if (!def) return null;
  s.achievements.push(id);
  s.stars += 10; // achievement bonus
  save(s);
  return { id, icon: def[1], desc: def[2] };
}

// ─────────────────────────────────────────
// STREAKS — call on owner activity
// ─────────────────────────────────────────

function touchStreak() {
  const s = load();
  const today = new Date().toISOString().slice(0, 10);
  if (s.streak.lastDay === today) return { count: s.streak.count, isNew: false };
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  s.streak.count = s.streak.lastDay === yesterday ? s.streak.count + 1 : 1;
  s.streak.lastDay = today;
  s.stars += s.streak.count; // streak pays daily
  save(s);
  return { count: s.streak.count, isNew: true, reward: s.streak.count };
}

// ─────────────────────────────────────────
// QUESTS — 3 daily, real bot actions
// ─────────────────────────────────────────

const QUEST_POOL = [
  { id: 'weather', desc: 'ask her the weather (.weather)', check: 'weather', reward: 15 },
  { id: 'locate', desc: 'locate a place (.locate)', check: 'locate', reward: 15 },
  { id: 'tarot', desc: 'pull a tarot card (.tarot)', check: 'tarot', reward: 20 },
  { id: 'webcam', desc: 'open a live cam (.webcam random)', check: 'webcam', reward: 20 },
  { id: 'satellite', desc: 'satellite lock any place (.satellite)', check: 'satellite', reward: 25 },
  { id: 'roast', desc: 'roast someone (.roast)', check: 'roast', reward: 25 },
  { id: 'briefing', desc: 'read the morning herald (.briefing)', check: 'briefing', reward: 20 },
  { id: 'portal', desc: 'open the portal (.portal)', check: 'portal', reward: 15 },
  { id: 'habit', desc: 'check in a habit (.habit <name>)', check: 'habit', reward: 20 },
  { id: 'weather2', desc: 'check the ISS (.iss)', check: 'iss', reward: 20 },
  { id: 'apod', desc: 'see NASA\'s picture of the day (.apod)', check: 'apod', reward: 25 },
  { id: 'fortune', desc: 'get a fortune (.fortune)', check: 'fortune', reward: 10 },
  { id: 'kev', desc: 'check the CISA threat feed (.kev)', check: 'kev', reward: 20 },
  { id: 'wish', desc: 'add a wish to the star jar (.wish)', check: 'wish', reward: 15 },
  { id: 'briefing2', desc: 'do a password check (.passanalyze)', check: 'passanalyze', reward: 20 },
];

function rollQuests() {
  const s = load();
  const today = new Date().toISOString().slice(0, 10);
  if (s.quests.date === today && s.quests.list.length) return s.quests.list;
  const seed = crypto.createHash('sha256').update('quests-' + today).digest();
  const pool = [...QUEST_POOL];
  const picked = [];
  for (let i = 0; i < 3; i++) {
    const n = seed[i] % pool.length;
    picked.push(pool.splice(n, 1)[0]);
  }
  s.quests = { date: today, list: picked, claimed: [] };
  save(s);
  return picked;
}

function progressQuest(commandName) {
  const s = load();
  const today = new Date().toISOString().slice(0, 10);
  if (s.quests.date !== today) return null;
  const q = s.quests.list.find(x => x.check === commandName);
  if (!q || s.quests.claimed.includes(q.id)) return null;
  s.quests.claimed.push(q.id);
  s.stars += q.reward;
  s.xp += 25;
  const allDone = s.quests.claimed.length >= s.quests.list.length;
  if (allDone) { s.stars += 30; s.xp += 50; }
  save(s);
  return { quest: q, allDone, bonus: allDone ? 30 : 0 };
}

// ─────────────────────────────────────────
// LOOT BOXES
// ─────────────────────────────────────────

const LOOT_TABLE = [
  { id: 'star_shard', name: 'Star Shard', icon: '✨', rarity: 'common', stars: 5 },
  { id: 'moon_dust', name: 'Moon Dust', icon: '🌙', rarity: 'common', stars: 5 },
  { id: 'wolf_fang', name: 'Wolf Fang', icon: '🦷', rarity: 'rare', stars: 15 },
  { id: 'comet_tail', name: 'Comet Tail', icon: '☄️', rarity: 'rare', stars: 15 },
  { id: 'nebula_vial', name: 'Nebula Vial', icon: '🧪', rarity: 'epic', stars: 40 },
  { id: 'eclipse_core', name: 'Eclipse Core', icon: '🌑', rarity: 'epic', stars: 40 },
  { id: 'celestial_crown', name: 'Celestial Crown', icon: '♛', rarity: 'legendary', stars: 100 },
  { id: 'wolf_crown', name: 'The Wolf Crown', icon: '🐺', rarity: 'mythic', stars: 250 },
];

function openLoot() {
  const s = load();
  const seed = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
  const roll = Number(seed % 100n);
  let rarity;
  if (roll < 2) rarity = 'mythic';
  else if (roll < 8) rarity = 'legendary';
  else if (roll < 25) rarity = 'epic';
  else if (roll < 60) rarity = 'rare';
  else rarity = 'common';
  const options = LOOT_TABLE.filter(l => l.rarity === rarity);
  const item = options[Number((seed >> 8n) % BigInt(options.length))];
  s.loot[item.id] = (s.loot[item.id] || 0) + 1;
  s.stars += item.stars;
  save(s);
  return item;
}

// ─────────────────────────────────────────
// PET
// ─────────────────────────────────────────

function feedPet() {
  const s = load();
  const today = new Date().toISOString().slice(0, 10);
  if (s.pet.lastFed === today) return { error: 'already today' };
  s.pet.fed += 1;
  s.pet.lastFed = today;
  s.pet.mood = 'radiant';
  s.xp += 10;
  save(s);
  return { fed: s.pet.fed };
}

// ─────────────────────────────────────────
// STATS CARD
// ─────────────────────────────────────────

function getCard() {
  const s = load();
  const level = levelFromXp(s.xp);
  const cur = totalXpForLevel(level);
  const next = level < 30 ? totalXpForLevel(level + 1) : cur + 1;
  const pct = Math.min(100, Math.round(((s.xp - cur) / (next - cur)) * 100));
  return {
    ...s, level,
    title: LEVEL_TITLES[level - 1][0],
    nextTitle: level < 30 ? LEVEL_TITLES[level][0] : 'MAX',
    xpIntoLevel: s.xp - cur,
    xpForNext: next - cur,
    pct,
    pet: petStageFor(level),
    petStageIdx: PET_STAGES.indexOf(petStageFor(level)),
  };
}

module.exports = {
  LEVEL_TITLES, PET_STAGES, ACHIEVEMENTS, LOOT_TABLE,
  grantXp, levelFromXp, xpForLevel, totalXpForLevel, levelFromXp,
  touchStreak, rollQuests, progressQuest, openLoot, feedPet,
  checkAchievement, getCard, load, save,
};
