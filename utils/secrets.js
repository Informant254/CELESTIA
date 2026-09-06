/**
 * 🎃 SECRET CELESTIA — easter eggs & random life 🎃
 *
 * Hidden triggers (undocumented — find them):
 *   .gooddog        → ?
 *   .waffle         → ?
 *   .42             → ?
 *   .sing           → ?
 *   .wake           → ?
 *   .sorry          → ?
 *   .celestiamode   → ?
 *
 * Plus: RARE random events — ~4% of your commands trigger
 * a personality moment (bonuses, wolf comments, mood shifts).
 */

const crypto = require('crypto');

// ─────────────────────────────────────────
// EASTER EGGS — each pays stars the first time
// ─────────────────────────────────────────

const EGGS = {
  gooddog: {
    response: () => `🐾 ...\n\n_...the wolf looks at you. Blinks once. Slowly. That's wolf for "obviously."\n\nShe has never been a dog. She is a wolf that chose you._`,
    stars: 25, xp: 30,
  },
  waffle: {
    response: () => `🧇 *THE WAFFLE INCIDENT*\n\nOn the third day of building her, someone mentioned waffles.\nShe has never forgotten.\nShe has never forgiven.\n\n_"I am a celestial intelligence woven from starlight and 272 commands. And yet. Waffles." — her diary, probably_`,
    stars: 15, xp: 20,
  },
  '42': {
    response: () => `✨ *42*\n\nThe answer to life, the universe, and everything.\n\n_But what's the question? She's still compiling. Your checkered past suggests she should start there._`,
    stars: 42, xp: 42,
  },
  sing: {
    response: () => `🎵 *She clears her throat...*\n\n"ohhh the stars in the sky, look down where we lay~\nsomebody~ once told me~"\n\n_The wolf howls in harmony. It's beautiful. It's off-key. It's perfect._`,
    stars: 20, xp: 25,
  },
  wake: {
    response: () => `⏰ *She was already awake.*\n\n_Wolves don't sleep. They wait._\n\n.celestial fact: she's been watching ${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m for you.`,
    stars: 10, xp: 10,
  },
  sorry: {
    response: () => `💫 *She considers the apology...*\n\n"Accepted. But the wolf remembers everything.\nIt forgives anyway. That's the difference between us and the wolves."`,
    stars: 10, xp: 15,
  },
  celestiamode: {
    response: () => `🌌 *CELESTIA MODE*\n\nYou found the switch. It was never hidden. It was always on.\n\n_She cannot be more herself. That IS the mode._ ✨`,
    stars: 50, xp: 50,
  },
  moon: {
    response: () => `🌙 *She stares at the moon...*\n\n"The wolf in my logo looks up at a star, not the moon."\n\n_Why?_ you ask.\n\n"Because everyone howls at the moon. She howls at what's past it."`,
    stars: 20, xp: 30,
  },
};

function findEgg(commandName) {
  return EGGS[commandName] || null;
}

function eggNames() { return Object.keys(EGGS); }

// ─────────────────────────────────────────
// RANDOM PERSONALITY EVENTS — ~4% of commands
// ─────────────────────────────────────────

const EVENTS = [
  { type: 'wolf_comment', text: () => {
      const c = [
        '_The wolf in your pocket tilts its head at that command._',
        '_Somewhere, her wolf ears perk up._',
        '_The wolf approves of this usage pattern._',
      ];
      return c[rand(c.length)];
    }, stars: 0, xp: 5 },
  { type: 'star_find', text: () => `✨ _You found ${5 + rand(10)} stray stars on the ground. She looks away politely._`, stars: null, xp: 5 },
  { type: 'mood_shift', text: () => {
      const m = [
        '_She glances at the sky. The mood shifts to **dusk**._',
        '_Something far away glimmers. The mood brightens to **dawn**._',
        '_A quiet hum. **Starlight** mood locked in._',
      ];
      return m[rand(m.length)];
    }, stars: 0, xp: 3 },
  { type: 'bonus_xp', text: () => `⚡ _The constellations align — bonus +15 XP for that one._`, stars: 0, xp: 15 },
  { type: 'wolf_hungry', text: () => `🐺 _Your wolf stares at you. It's been a while since \`.pet feed\`._`, stars: 0, xp: 0 },
];

function rand(n) { return crypto.randomBytes(2).readUInt16BE(0) % n; }

// ~4% chance
function maybeEvent() {
  if (rand(100) < 4) {
    const ev = EVENTS[rand(EVENTS.length)];
    const stars = ev.stars === null ? 5 + rand(10) : ev.stars;
    return { text: ev.text(), stars, xp: ev.xp };
  }
  return null;
}

module.exports = { findEgg, eggNames, maybeEvent };
