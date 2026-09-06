/**
 * 🔮 MYSTIC — tarot, horoscope, numerology, fortunes 🔮
 *
 * Nothing here is "random one-liners": every pull is structured —
 * full 78-card tarot deck with upright+reversed meanings, daily-seeded
 * horoscopes (same reading all day, new one at midnight), real
 * numerology math, and poetic fortune generation.
 */

const crypto = require('crypto');

// ─────────────────────────────────────────
// TAROT — the full deck
// ─────────────────────────────────────────

const MAJOR = [
  ['The Fool', 'new beginnings, leaps of faith, innocence', 'recklessness, hesitation when the door is open'],
  ['The Magician', 'willpower, manifestation, skill', 'manipulation, untapped talent'],
  ['The High Priestess', 'intuition, secrets, the unseen', 'ignored instincts, surface living'],
  ['The Empress', 'abundance, creation, nurture', 'creative block, smothering'],
  ['The Emperor', 'structure, authority, order', 'tyranny, chaos, weak boundaries'],
  ['The Hierophant', 'tradition, guidance, learning', 'dogma, rebellion without cause'],
  ['The Lovers', 'union, choices of the heart, alignment', 'discord, misalignment of values'],
  ['The Chariot', 'victory, drive, control', 'scattered force, lost steering'],
  ['Strength', 'gentle power, courage, patience', 'self-doubt, force over grace'],
  ['The Hermit', 'solitude, inner search, wisdom', 'isolation, refusing the lantern'],
  ['Wheel of Fortune', 'cycles, destiny, turning points', 'resisting change, bad timing'],
  ['Justice', 'truth, balance, consequence', 'bias, avoided truth'],
  ['The Hanged Man', 'pause, new perspective, sacrifice', 'stagnation, martyrdom'],
  ['Death', 'endings that clear ground, transformation', 'clinging to the dead thing'],
  ['Temperance', 'harmony, patience, blending', 'excess, impatience'],
  ['The Devil', 'bondage, attachment, shadow', 'breaking chains, seeing the chain'],
  ['The Tower', 'sudden collapse, revelation, lightning', 'averted disaster, fear of truth'],
  ['The Star', 'hope, renewal, faith after storm', 'dimmed faith, disconnection'],
  ['The Moon', 'dreams, illusion, the subconscious', 'confusion lifting, secrets revealed'],
  ['The Sun', 'joy, success, clarity', 'clouded joy, delayed success'],
  ['Judgement', 'awakening, reckoning, rising', 'self-doubt, ignoring the call'],
  ['The World', 'completion, wholeness, arrival', 'unfinished business, shortcuts'],
];

const SUITS = {
  Wands: { element: 'fire 🔥', theme: 'passion, will, creation', cards: [
    ['Ace', 'a spark of inspiration', 'the spark that never catches'],
    ['Two', 'planning the journey', 'fear of the wider world'],
    ['Three', 'expansion, ships launched', 'delayed growth'],
    ['Four', 'celebration, homecoming', 'unstable foundation'],
    ['Five', 'competition, conflict', 'avoided necessary battles'],
    ['Six', 'victory, recognition', 'ego inflation'],
    ['Seven', 'defending your ground', 'giving up the hill'],
    ['Eight', 'speed, messages, movement', 'haste, missed details'],
    ['Nine', 'resilience, last stand', 'paranoia, burnout'],
    ['Ten', 'burdens carried to completion', 'the weight that breaks'],
    ['Page', 'curiosity, exploration', 'restlessness without aim'],
    ['Knight', 'adventure, bold action', 'impulsiveness'],
    ['Queen', 'confidence, warmth, charisma', 'jealousy of others\' fire'],
    ['King', 'visionary leadership', 'tyranny of vision'],
  ]},
  Cups: { element: 'water 💧', theme: 'emotion, love, intuition', cards: [
    ['Ace', 'a new feeling, love offered', 'the cup emptied'],
    ['Two', 'union, partnership, soul-mirror', 'imbalance between hearts'],
    ['Three', 'friendship, community, joy', 'gossip, third-wheeling'],
    ['Four', 'apathy, meditation, the offered cup ignored', 'new awareness'],
    ['Five', 'grief, loss, what spilled', 'moving through sorrow'],
    ['Six', 'nostalgia, childhood, kindness', 'stuck in the past'],
    ['Seven', 'choices, dreams, illusions of more', 'clarity chosen'],
    ['Eight', 'walking away from what drains', 'fear of leaving'],
    ['Nine', 'wish fulfilled, contentment', 'smug satisfaction'],
    ['Ten', 'emotional completion, family joy', 'perfect picture, hollow core'],
    ['Page', 'creative messages, sensitivity', 'moodiness'],
    ['Knight', 'the romantic quest', 'idealization'],
    ['Queen', 'compassion, emotional mastery', 'overwhelming empathy'],
    ['King', 'emotional calm, diplomacy', 'coldness disguised as calm'],
  ]},
  Swords: { element: 'air 🌬️', theme: 'thought, truth, conflict', cards: [
    ['Ace', 'clarity, breakthrough truth', 'confusion weaponized'],
    ['Two', 'stalemate, blindfolded choice', 'indecision breaking'],
    ['Three', 'heartbreak, the necessary pain', 'healing beginning'],
    ['Four', 'rest, recovery, truce', 'restlessness'],
    ['Five', 'hollow victory, conflict', 'reconciliation, walking away'],
    ['Six', 'passage to safer waters', 'unable to leave'],
    ['Seven', 'strategy, stealth', 'self-deception'],
    ['Eight', 'feeling trapped, binds', 'seeing the loose knot'],
    ['Nine', 'anxiety, the night mind', 'hope returning'],
    ['Ten', 'rock bottom, ending of the story', 'recovery, worst passed'],
    ['Page', 'curiosity, vigilance', 'gossip'],
    ['Knight', 'fearless charge, logic swift', 'aggression'],
    ['Queen', 'clear boundaries, perceptiveness', 'coldness, harshness'],
    ['King', 'authority of truth, judgment', 'dogma, tyranny of logic'],
  ]},
  Pentacles: { element: 'earth 🌿', theme: 'matter, money, body', cards: [
    ['Ace', 'a seed of prosperity', 'missed opportunity'],
    ['Two', 'juggling resources', 'dropped balls'],
    ['Three', 'craft, teamwork, skill shown', 'poor planning'],
    ['Four', 'security, holding', 'hoarding, fear of loss'],
    ['Five', 'hard times, exclusion', 'recovery, help accepted'],
    ['Six', 'generosity, sharing wealth', 'strings attached'],
    ['Seven', 'patience before harvest', 'impatience, wasted effort'],
    ['Eight', 'mastery through repetition', 'perfectionism'],
    ['Nine', 'independence, earned comfort', 'dependence, over-indulgence'],
    ['Ten', 'legacy, wealth complete', 'family debt, hollow legacy'],
    ['Page', 'student of the real world', 'procrastination'],
    ['Knight', 'reliable, methodical progress', 'stubbornness'],
    ['Queen', 'abundance, practical nurture', 'workaholism'],
    ['King', 'mastery of the material', 'greed, control'],
  ]},
};

function buildDeck() {
  const deck = [];
  for (const [name, up, rev] of MAJOR) deck.push({ name, arcana: 'Major', up, rev });
  for (const [suit, s] of Object.entries(SUITS)) {
    for (const [rank, up, rev] of s.cards) {
      deck.push({ name: `${rank} of ${suit}`, arcana: suit, up: `${up} (${s.theme})`, rev });
    }
  }
  return deck; // 78
}

const DECK = buildDeck();

function seededShuffle(items, seed) {
  const out = [...items];
  let s = BigInt('0x' + seed);
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    const j = Number(s % BigInt(i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function drawTarot(count, seedStr) {
  const seed = crypto.createHash('sha256').update(seedStr).digest('hex').slice(0, 16);
  const shuffled = seededShuffle(DECK, seed);
  return shuffled.slice(0, count).map((card, i) => {
    const reversed = Number(BigInt('0x' + seed) >> BigInt(i * 3)) % 2 === 1;
    return { name: card.name, arcana: card.arcana, reversed, meaning: reversed ? card.rev : card.up, position: i };
  });
}

// ─────────────────────────────────────────
// HOROSCOPE — daily-seeded, consistent all day
// ─────────────────────────────────────────

const ZODIAC = [
  ['Aries', 'Mar 21 – Apr 19', '♈', 'the ram charges'],
  ['Taurus', 'Apr 20 – May 20', '♉', 'the bull builds'],
  ['Gemini', 'May 21 – Jun 20', '♊', 'the twins speak'],
  ['Cancer', 'Jun 21 – Jul 22', '♋', 'the crab carries home'],
  ['Leo', 'Jul 23 – Aug 22', '♌', 'the lion shines'],
  ['Virgo', 'Aug 23 – Sep 22', '♍', 'the maiden refines'],
  ['Libra', 'Sep 23 – Oct 22', '♎', 'the scales balance'],
  ['Scorpio', 'Oct 23 – Nov 21', '♏', 'the scorpion transforms'],
  ['Sagittarius', 'Nov 22 – Dec 21', '♐', 'the archer aims far'],
  ['Capricorn', 'Dec 22 – Jan 19', '♑', 'goat climbs anyway'],
  ['Aquarius', 'Jan 20 – Feb 18', '♒', 'the bearer pours'],
  ['Pisces', 'Feb 19 – Mar 20', '♓', 'the fish dream'],
];

const OPENINGS = ['The stars tilt toward you:', 'Mercury hums:', 'A quiet alignment forms:', 'The moon leans in:', 'Old light arrives:', 'Something orbits close:', 'The sky rearranges:', 'A door in the dark opens:'];
const BODIES = [
  'an idea you dismissed last week returns wearing better clothes',
  'a conversation you avoid is shorter than you fear',
  'what you build today outlasts the mood you built it in',
  'someone watches your consistency more than your talent',
  'the shortcut is watching you too; take the long road',
  'rest is not retreat — even the tide pulls back to return',
  'a small honesty today prevents a large repair next month',
  'the thing you think disqualifies you is the thing they remember',
  'discipline is just self-trust repeated',
  'you are between chapters — that\'s why it hurts to read',
  'generosity returns wearing someone else\'s coat',
  'the risk you keep re-measuring has already changed size',
  'ask for the thing. the silence after asking is survivable',
  'your future is being negotiated by your habits, not your plans',
  'a door closes; notice you\'re not in that room anymore',
  'the sign you want is the decision you\'re avoiding',
];
const CLOSINGS = ['Move gently, but move.', 'Hold the line today.', 'Say yes before noon.', 'Let evening do its work.', 'The stars did their part; do yours.', 'Trust the slow changes.', 'Write it down tonight.', 'Choose courage over comfort.'];

function horoscope(sign, dateSeed) {
  const idx = ZODIAC.findIndex(z => z[0].toLowerCase() === String(sign).toLowerCase());
  if (idx === -1) return null;
  const [name, dates, glyph, motto] = ZODIAC[idx];
  const seed = crypto.createHash('sha256').update(`${name}-${dateSeed}`).digest('hex').slice(0, 16);
  const n = BigInt('0x' + seed);
  const open = OPENINGS[Number(n % BigInt(OPENINGS.length))];
  const body = BODIES[Number((n >> 8n) % BigInt(BODIES.length))];
  const close = CLOSINGS[Number((n >> 20n) % BigInt(CLOSINGS.length))];
  const energy = Number((n >> 32n) % 100n) + 1;
  const lucky = Number((n >> 40n) % 49n) + 1;
  return { name, dates, glyph, motto, reading: `${open} ${body.charAt(0).toUpperCase() + body.slice(1)}. ${close}`, energy, lucky };
}

function todaySeed() { return new Date().toISOString().slice(0, 10); }

// ─────────────────────────────────────────
// NUMEROLOGY — real math
// ─────────────────────────────────────────

function numerology(numberOrName) {
  let n;
  if (/^\d+$/.test(String(numberOrName).replace(/\s/g, ''))) {
    n = parseInt(String(numberOrName).replace(/\s/g, ''), 10);
  } else {
    // pythagorean letter map
    const map = { a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8,i:9,j:1,k:2,l:3,m:4,n:5,o:6,p:7,q:8,r:9,s:1,t:2,u:3,v:4,w:5,x:6,y:7,z:8 };
    n = String(numberOrName).toLowerCase().split('').reduce((s, c) => s + (map[c] || 0), 0);
  }
  const reduceNum = (x) => { while (x > 9) { x = String(x).split('').reduce((s, d) => s + +d, 0); } return x; };
  const life = reduceNum(n);
  const MEANINGS = {
    1: ['The Leader', 'independence, originality, drive — the number that starts things'],
    2: ['The Diplomat', 'partnership, sensitivity, balance — the number that listens'],
    3: ['The Creator', 'expression, joy, art — the number that speaks beauty'],
    4: ['The Builder', 'order, loyalty, foundation — the number that stays'],
    5: ['The Adventurer', 'freedom, change, curiosity — the number that moves'],
    6: ['The Nurturer', 'love, responsibility, home — the number that holds'],
    7: ['The Seeker', 'wisdom, depth, solitude — the number that knows'],
    8: ['The Master', 'power, abundance, karma — the number that balances accounts'],
    9: ['The Sage', 'completion, compassion, release — the number that lets go'],
  };
  const [title, meaning] = MEANINGS[life] || ['The Unknown', 'beyond the map'];
  return { input: String(numberOrName), raw: n, life, title, meaning };
}

// ─────────────────────────────────────────
// FORTUNE — poetic, seeded by minute so it rarely repeats
// ─────────────────────────────────────────

const FORTUNE_SPARKS = [
  'a stranger will quote you back to yourself',
  'the rain will arrive exactly when you decide to walk',
  'an old number will almost be dialed, and that will be enough',
  'you will find the thing you lost the moment you stop needing it',
  'tonight\'s sky will look exactly like a night you\'ll miss later',
  'someone\'s silence about you is admiration they can\'t spell',
  'the small yes you say this week rewrites a month',
  'your future self already thanked you for today\'s discipline',
  'the door you keep testing is being unlocked from the other side',
  'the coin is still spinning. enjoy the spin.',
  'you\'ll teach someone something you thought everyone knew',
  'a forgotten playlist resurfaces and re-routes your whole evening',
  'what you forgive this month comes back as energy',
  'the stars literally do not care, and somehow that helps',
  'the risk is smaller than the regret. it always was.',
  'a message you\'re waiting for is being drafted right now',
];

function fortune(seedExtra) {
  const seed = crypto.createHash('sha256').update(`${Date.now()}-${seedExtra || ''}`).digest('hex');
  const n = BigInt('0x' + seed.slice(0, 16));
  const spark = FORTUNE_SPARKS[Number(n % BigInt(FORTUNE_SPARKS.length))];
  return `🔮 _${spark}._`;
}

module.exports = { drawTarot, horoscope, numerology, fortune, ZODIAC, todaySeed, DECK: DECK.length };
